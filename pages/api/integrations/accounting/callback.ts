import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess } from '@/lib/apiGuard';
import { prisma } from '@/lib/prisma';
import { buildAdapter, getAccountingConnection, saveAccountingConnection } from '@/lib/accounting';
import { requestJson } from '@/lib/accounting/http';
import { exchangeCode } from '@/lib/accounting/oauth';
import type { Credentials } from '@/lib/accounting/types';

// Where QuickBooks, Xero and Sage send the admin back after they approve the
// connection. Swaps the code for tokens, finds the company, and returns to
// Settings → Integrations with the outcome.

const back = (res: NextApiResponse, slug: string | null, outcome: Record<string, string>) => {
  const query = new URLSearchParams(outcome).toString();
  res.redirect(303, slug ? `/teams/${slug}/settings/integrations?${query}` : `/?${query}`);
};

async function findCompany(credentials: Credentials, realmId?: string) {
  const auth = { Authorization: `Bearer ${credentials.accessToken}` };
  if (credentials.provider === 'QUICKBOOKS') {
    if (!realmId) throw new Error('QuickBooks didn’t say which company was chosen.');
    return realmId;
  }
  if (credentials.provider === 'XERO') {
    const { data } = await requestJson<{ tenantId: string; tenantType: string }[]>('Xero', 'https://api.xero.com/connections', { headers: auth });
    const tenant = data.find((t) => t.tenantType === 'ORGANISATION') ?? data[0];
    if (!tenant) throw new Error('No Xero organisation was shared.');
    return tenant.tenantId;
  }
  const { data } = await requestJson<{ $items: { id: string }[] }>('Sage', 'https://api.accounting.sage.com/v3.1/businesses', { headers: auth });
  if (!data.$items?.[0]) throw new Error('No Sage business was found for this sign-in.');
  return data.$items[0].id;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const slug = state.includes('.') ? state.slice(0, state.indexOf('.')) : null;
  try {
    if (!slug) return back(res, null, { accounting_error: 'The sign-in came back without its state. Start again.' });

    // Only someone allowed to manage integrations for this team can finish.
    req.query.slug = slug;
    const member = await guardTeamAccess(req, res, 'team', 'update');

    const connection = await getAccountingConnection(member.teamId);
    if (!connection || connection.options.oauthState !== state) {
      return back(res, slug, { accounting_error: 'This sign-in doesn’t match the one started here. Start again.' });
    }
    if (typeof req.query.error === 'string') {
      return back(res, slug, { accounting_error: `The accounting system said: ${req.query.error_description || req.query.error}` });
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) return back(res, slug, { accounting_error: 'No authorisation code came back.' });

    let credentials = await exchangeCode(connection.credentials, code);
    const companyId = await findCompany(credentials, typeof req.query.realmId === 'string' ? req.query.realmId : undefined);
    if (connection.credentials.companyId && connection.credentials.companyId !== companyId) {
      // A different company: links to the old one's records no longer apply.
      await prisma.accountingLink.deleteMany({ where: { teamId: member.teamId } });
    }
    credentials = { ...credentials, companyId };
    const companyName = await buildAdapter(credentials, connection.options).companyName();
    await saveAccountingConnection(member.teamId, { ...credentials, companyName }, { ...connection.options, oauthState: undefined });
    await prisma.connection.update({ where: { id: connection.id }, data: { lastError: null, lastSuccessAt: new Date() } });
    back(res, slug, { accounting: 'connected' });
  } catch (error) {
    back(res, slug, { accounting_error: (error instanceof Error ? error.message : 'Connecting failed.').slice(0, 300) });
  }
}
