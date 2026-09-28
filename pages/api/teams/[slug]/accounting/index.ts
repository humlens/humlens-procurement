import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { ApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { getAccountingConnection, isSignedIn, saveAccountingConnection, PROVIDERS } from '@/lib/accounting';
import { envClient, redirectUri } from '@/lib/accounting/oauth';
import type { AccountingOptions } from '@/lib/accounting/types';
import { validateWithSchema } from '@/lib/zod';

const settingsSchema = z.object({
  expenseAccountId: z.string().trim().max(100).optional(),
  expenseAccountName: z.string().trim().max(300).optional(),
  paymentAccountId: z.string().trim().max(100).optional(),
  paymentAccountName: z.string().trim().max(300).optional(),
  subsidiaryId: z.string().trim().max(50).optional(),
  taxRateId: z.string().trim().max(100).optional(),
  syncPurchaseOrders: z.boolean().optional(),
  syncBills: z.boolean().optional(),
  syncPayments: z.boolean().optional(),
  pullPayments: z.boolean().optional(),
});

// GET: the accounting connection and what it syncs. PUT: change what syncs
// and where it posts. DELETE: disconnect (records already sent stay linked).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const member = await guardTeamAccess(req, res, 'team', 'read');
      const connection = await getAccountingConnection(member.teamId);
      const counts = await prisma.accountingLink.groupBy({ by: ['kind'], where: { teamId: member.teamId }, _count: true });
      const { oauthState: _state, ...options } = connection?.options ?? ({} as AccountingOptions);
      res.status(200).json({
        data: {
          redirectUri: redirectUri(),
          appConfigured: Object.fromEntries(PROVIDERS.map((p) => [p, Boolean(envClient(p))])),
          connection: connection
            ? {
                provider: connection.credentials.provider,
                companyName: connection.credentials.companyName ?? null,
                signedIn: isSignedIn(connection.credentials),
                sandbox: Boolean(connection.credentials.sandbox),
                options,
                lastSuccessAt: connection.lastSuccessAt,
                lastError: connection.lastError,
              }
            : null,
          synced: Object.fromEntries(counts.map((row) => [row.kind, row._count])),
        },
      });
      return;
    }

    if (req.method === 'PUT') {
      const member = await guardTeamAccess(req, res, 'team', 'update');
      setAuditEvent(res, { resource: 'integration', action: 'update' });
      const body = validateWithSchema(settingsSchema, req.body);
      const connection = await getAccountingConnection(member.teamId);
      if (!connection) throw new ApiError(404, 'No accounting system is connected.');
      await saveAccountingConnection(member.teamId, connection.credentials, { ...connection.options, ...body });
      res.status(200).json({ data: { saved: true } });
      return;
    }

    if (req.method === 'DELETE') {
      const member = await guardTeamAccess(req, res, 'team', 'update');
      setAuditEvent(res, { resource: 'integration', action: 'disconnect' });
      await prisma.connection.deleteMany({ where: { teamId: member.teamId, kind: 'ACCOUNTING' } });
      res.status(204).end();
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
