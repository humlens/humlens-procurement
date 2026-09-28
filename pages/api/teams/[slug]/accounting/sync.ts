import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { ApiError } from '@/lib/errors';
import { queueAccountingSync, queueBackfill } from '@/lib/accounting/sync';
import { AccountingError } from '@/lib/accounting/types';
import { validateWithSchema } from '@/lib/zod';

const schema = z.object({
  record: z.enum(['PURCHASE_ORDER', 'BILL', 'PAYMENT']).optional(),
  id: z.string().uuid().optional(),
});

// POST {}: send everything already approved that isn't there yet.
// POST { record, id }: send one record now, even if that kind is switched off.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const member = await guardTeamAccess(req, res, 'team', 'update');
    setAuditEvent(res, { resource: 'integration', action: 'sync' });
    const body = validateWithSchema(schema, req.body ?? {});
    try {
      if (body.record && body.id) {
        const event = await queueAccountingSync(member.teamId, body.record, body.id, { force: true });
        res.status(200).json({ data: { queued: event ? 1 : 0 } });
      } else {
        res.status(200).json({ data: { queued: await queueBackfill(member.teamId) } });
      }
    } catch (error) {
      throw new ApiError(422, error instanceof AccountingError ? error.message : 'Couldn’t queue the sync.');
    }
  } catch (error) {
    handleApiError(res, error);
  }
}
