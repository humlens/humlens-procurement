import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/secrets';

import type { AdapterContext } from './context';
import { requestJson } from './http';
import { netsuite, netsuiteHost } from './netsuite';
import { isOAuthProvider, needsRefresh, refreshTokens } from './oauth';
import { quickbooks } from './quickbooks';
import { sage } from './sage';
import { AccountingError, PROVIDER_NAMES, type AccountingAdapter, type AccountingOptions, type Credentials, type Provider } from './types';
import { xero } from './xero';

// The team's accounting system: a Connection of kind ACCOUNTING whose secret
// holds the (encrypted) credentials and whose options say what to sync.

const factories: Record<Provider, (ctx: AdapterContext) => AccountingAdapter> = { QUICKBOOKS: quickbooks, XERO: xero, SAGE: sage, NETSUITE: netsuite };

const apiBase: Record<Provider, (credentials: Credentials) => string> = {
  QUICKBOOKS: (c) => (c.sandbox ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com'),
  XERO: () => 'https://api.xero.com',
  SAGE: () => 'https://api.accounting.sage.com',
  NETSUITE: (c) => netsuiteHost(c.companyId ?? ''),
};

export type AccountingConnection = {
  id: string;
  credentials: Credentials;
  options: AccountingOptions;
  lastSuccessAt: Date | null;
  lastError: string | null;
};

export async function getAccountingConnection(teamId: string): Promise<AccountingConnection | null> {
  const row = await prisma.connection.findUnique({ where: { teamId_kind: { teamId, kind: 'ACCOUNTING' } } });
  if (!row) return null;
  try {
    const credentials = JSON.parse(decryptSecret(row.secret)) as Credentials;
    return { id: row.id, credentials, options: row.options as AccountingOptions, lastSuccessAt: row.lastSuccessAt, lastError: row.lastError };
  } catch {
    return null;
  }
}

/** Connected means signed in, not just started: an OAuth hand-off may still be in progress. */
export const isSignedIn = (credentials: Credentials) =>
  credentials.provider === 'NETSUITE' ? Boolean(credentials.tokenId && credentials.companyId) : Boolean(credentials.refreshToken && credentials.companyId);

export async function saveAccountingConnection(teamId: string, credentials: Credentials, options: AccountingOptions, createdById?: string) {
  const data = {
    url: apiBase[credentials.provider](credentials),
    secret: encryptSecret(JSON.stringify(credentials)),
    options: options as Prisma.InputJsonValue,
  };
  return prisma.connection.upsert({
    where: { teamId_kind: { teamId, kind: 'ACCOUNTING' } },
    create: { teamId, kind: 'ACCOUNTING', createdById, ...data },
    update: data,
  });
}

async function persistCredentials(connectionId: string, credentials: Credentials) {
  await prisma.connection.update({ where: { id: connectionId }, data: { secret: encryptSecret(JSON.stringify(credentials)) } });
}

/**
 * An adapter for these credentials. OAuth tokens are refreshed before they
 * expire (and once more on a 401), and saved back when `connectionId` is given.
 */
export function buildAdapter(credentials: Credentials, options: AccountingOptions, connectionId?: string) {
  const system = PROVIDER_NAMES[credentials.provider];
  const ctx: AdapterContext = {
    credentials,
    options,
    async request<T>(url: string, init: Parameters<typeof requestJson>[2] = {}) {
      const oauth = isOAuthProvider(credentials.provider);
      const refresh = async () => {
        const next = await refreshTokens(ctx.credentials);
        ctx.credentials = next;
        Object.assign(credentials, next);
        if (connectionId) await persistCredentials(connectionId, next);
      };
      if (oauth && needsRefresh(ctx.credentials)) await refresh();
      const withAuth = () => ({
        ...init,
        headers: { ...(oauth ? { Authorization: `Bearer ${ctx.credentials.accessToken}` } : {}), ...init.headers },
      });
      try {
        return await requestJson<T>(system, url, withAuth());
      } catch (error) {
        if (oauth && error instanceof AccountingError && error.status === 401) {
          await refresh();
          return requestJson<T>(system, url, withAuth());
        }
        throw error;
      }
    },
  };
  return factories[credentials.provider](ctx);
}

export async function getAccountingAdapter(teamId: string) {
  const connection = await getAccountingConnection(teamId);
  if (!connection || !isSignedIn(connection.credentials)) return null;
  return { connection, adapter: buildAdapter(connection.credentials, connection.options, connection.id) };
}

export { PROVIDER_NAMES, PROVIDERS } from './types';
export type { Provider, Credentials, AccountingOptions } from './types';
