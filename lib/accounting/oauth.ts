import { requestJson } from './http';
import { AccountingError, type Credentials, type Provider } from './types';

// OAuth 2.0 for QuickBooks Online, Xero and Sage Accounting. Each customer
// registers their own app with the provider (this runs in their cloud), so
// the client ID and secret come from the settings form, or from env vars
// (QUICKBOOKS_CLIENT_ID / _SECRET, XERO_…, SAGE_…) when set for everyone.

type OAuthProvider = Exclude<Provider, 'NETSUITE'>;

const config: Record<OAuthProvider, { authorize: string; token: string; scope: string; basicAuth: boolean }> = {
  QUICKBOOKS: {
    authorize: 'https://appcenter.intuit.com/connect/oauth2',
    token: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    scope: 'com.intuit.quickbooks.accounting',
    basicAuth: true,
  },
  XERO: {
    authorize: 'https://login.xero.com/identity/connect/authorize',
    token: 'https://identity.xero.com/connect/token',
    // Apps created on Xero's newer granular scopes can set XERO_SCOPES instead.
    scope: process.env.XERO_SCOPES || 'offline_access accounting.transactions accounting.contacts accounting.settings.read',
    basicAuth: true,
  },
  SAGE: {
    authorize: 'https://www.sageone.com/oauth2/auth/central?filter=apiv3.1',
    token: 'https://oauth.accounting.sage.com/token',
    scope: 'full_access',
    basicAuth: false,
  },
};

export const isOAuthProvider = (provider: Provider): provider is OAuthProvider => provider !== 'NETSUITE';

export const appUrl = () => (process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:4100').replace(/\/+$/, '');

/** Register exactly this address as the redirect URI in the provider's developer console. */
export const redirectUri = () => `${appUrl()}/api/integrations/accounting/callback`;

export const envClient = (provider: Provider) => {
  const id = process.env[`${provider}_CLIENT_ID`];
  const secret = process.env[`${provider}_CLIENT_SECRET`];
  return id && secret ? { clientId: id, clientSecret: secret } : null;
};

export function authorizeUrl(provider: OAuthProvider, clientId: string, state: string) {
  const url = new URL(config[provider].authorize);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('scope', config[provider].scope);
  url.searchParams.set('state', state);
  return url.toString();
}

type TokenAnswer = { access_token: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(credentials: Credentials, form: Record<string, string>) {
  const provider = credentials.provider as OAuthProvider;
  if (!credentials.clientId || !credentials.clientSecret) throw new AccountingError('The app’s client ID and secret are missing.', false);
  const { token, basicAuth } = config[provider];
  const headers: Record<string, string> = {};
  if (basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`;
  } else {
    form = { ...form, client_id: credentials.clientId, client_secret: credentials.clientSecret };
  }
  const { data } = await requestJson<TokenAnswer>('the sign-in service', token, { method: 'POST', headers, form });
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 1800) * 1000,
  };
}

export const exchangeCode = (credentials: Credentials, code: string) =>
  tokenRequest(credentials, { grant_type: 'authorization_code', code, redirect_uri: redirectUri() });

export async function refreshTokens(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) throw new AccountingError('Signed out of the accounting system. Reconnect it in Settings → Integrations.', false);
  try {
    return await tokenRequest(credentials, { grant_type: 'refresh_token', refresh_token: credentials.refreshToken });
  } catch (error) {
    // A rejected refresh token (revoked, or unused for too long) needs a person to reconnect.
    if (error instanceof AccountingError && error.status && error.status >= 400 && error.status < 500) {
      throw new AccountingError('The accounting system signed us out. Reconnect it in Settings → Integrations.', false, error.status);
    }
    throw error;
  }
}

/** True when the access token has less than two minutes left. */
export const needsRefresh = (credentials: Credentials) => !credentials.accessToken || !credentials.expiresAt || credentials.expiresAt - Date.now() < 120_000;
