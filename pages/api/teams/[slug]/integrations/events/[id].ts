import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { dismissEvent, retryEvent } from '@/lib/outbox';
import { validateWithSchema } from '@/lib/zod';

// POST { action: 'retry' | 'dismiss' } on a message to a connected app.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const member = await guardTeamAccess(req, res, 'team', 'update');
    const { action } = validateWithSchema(z.object({ action: z.enum(['retry', 'dismiss']) }), req.body);
    setAuditEvent(res, { resource: 'integration_message', action });
    const id = req.query.id as string;
    if (action === 'retry') {
      res.status(200).json({ data: await retryEvent(member.teamId, id) });
    } else {
      await dismissEvent(member.teamId, id);
      res.status(200).json({ data: { dismissed: true } });
    }
  } catch (error) {
    handleApiError(res, error);
  }
}
