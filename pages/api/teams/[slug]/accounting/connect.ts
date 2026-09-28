import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { ApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { buildAdapter, getAccountingConnection, saveAccountingConnection } from '@/lib/accounting';
import { authorizeUrl, envClient, isOAuthProvider } from '@/lib/accounting/oauth';
import { AccountingError, type AccountingOptions, type Credentials } from '@/lib/accounting/types';
import { validateWithSchema } from '@/lib/zod';

const oauth = <P extends 'QUICKBOOKS' | 'XERO' | 'SAGE'>(provider: P) =>
  z.object({
    provider: z.literal(provider),
    clientId: z.string().trim().max(300).optional(),
    clientSecret: z.string().trim().max(300).optional(),
    sandbox: z.boolean().optional(),
  });

const schema = z.discriminatedUnion('provider', [
  oauth('QUICKBOOKS'),
  oauth('XERO'),
  oauth('SAGE'),
  z.object({
    provider: z.literal('NETSUITE'),
    accountId: z.string().trim().min(1, 'Enter the NetSuite account ID.').max(50).regex(/^[A-Za-z0-9_-]+$/, 'Account IDs look like 1234567 or 1234567_SB1.'),
    consumerKey: z.string().trim().min(1, 'Enter the consumer key.').max(300),
    consumerSecret: z.string().trim().min(1, 'Enter the consumer secret.').max(300),
    tokenId: z.string().trim().min(1, 'Enter the token ID.').max(300),
    tokenSecret: z.string().trim().min(1, 'Enter the token secret.').max(300),
  }),
]);

const defaults = (provider: Credentials['provider']): AccountingOptions => ({
  provider,
  syncPurchaseOrders: provider !== 'SAGE',
  syncBills: true,
  syncPayments: true,
  pullPayments: true,
});

// POST: start connecting an accounting system. OAuth systems answer with the
// address to sign in at (the callback finishes the job); NetSuite's tokens are
// checked straight away.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const member = await guardTeamAccess(req, res, 'team', 'update');
    setAuditEvent(res, { resource: 'integration', action: 'connect' });
    const body = validateWithSchema(schema, req.body);
    const previous = await getAccountingConnection(member.teamId);
    // Keep settings when reconnecting the same system.
    const options = previous?.credentials.provider === body.provider ? { ...defaults(body.provider), ...previous.options } : defaults(body.provider);

    if (body.provider === 'NETSUITE') {
      const credentials: Credentials = {
        provider: 'NETSUITE',
        companyId: body.accountId,
        consumerKey: body.consumerKey,
        consumerSecret: body.consumerSecret,
        tokenId: body.tokenId,
        tokenSecret: body.tokenSecret,
      };
      let companyName: string;
      try {
        companyName = await buildAdapter(credentials, options).companyName();
      } catch (error) {
        throw new ApiError(422, error instanceof AccountingError ? error.message : 'Could not reach NetSuite.');
      }
      if (previous?.credentials.companyId && previous.credentials.companyId !== credentials.companyId) {
        await prisma.accountingLink.deleteMany({ where: { teamId: member.teamId } });
      }
      await saveAccountingConnection(member.teamId, { ...credentials, companyName }, { ...options, oauthState: undefined }, member.userId);
      res.status(200).json({ data: { connected: true, companyName } });
      return;
    }

    if (!isOAuthProvider(body.provider)) throw new ApiError(422, 'Unknown accounting system.');
    const fromEnv = envClient(body.provider);
    const reuse = previous?.credentials.provider === body.provider ? previous.credentials : null;
    const clientId = body.clientId || fromEnv?.clientId || reuse?.clientId;
    const clientSecret = body.clientSecret || fromEnv?.clientSecret || reuse?.clientSecret;
    if (!clientId || !clientSecret) throw new ApiError(422, 'Enter the client ID and secret of the app you registered with the accounting system.');

    // The state carries the team so the callback can check the person finishing is allowed to.
    const state = `${member.team.slug}.${crypto.randomBytes(18).toString('base64url')}`;
    const credentials: Credentials = {
      ...(reuse ?? {}),
      provider: body.provider,
      clientId,
      clientSecret,
      sandbox: body.provider === 'QUICKBOOKS' ? Boolean(body.sandbox) : undefined,
    };
    await saveAccountingConnection(member.teamId, credentials, { ...options, oauthState: state }, member.userId);
    res.status(200).json({ data: { authorizeUrl: authorizeUrl(body.provider, clientId, state) } });
  } catch (error) {
    handleApiError(res, error);
  }
}
