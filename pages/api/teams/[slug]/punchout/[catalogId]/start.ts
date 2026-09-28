import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { startPunchout } from '@/lib/punchout/sessions';
import { validateWithSchema } from '@/lib/zod';

// POST { requisitionId? }: opens the supplier's catalog. Answers with the
// address to send the browser to; the cart comes back to /api/punchout/return.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end();
    const member = await guardTeamAccess(req, res, 'requisition', 'create');
    setAuditEvent(res, { resource: 'punchout_session', action: 'start' });
    const body = validateWithSchema(z.object({ requisitionId: z.string().uuid().optional() }), req.body ?? {});
    const result = await startPunchout({
      teamId: member.teamId,
      catalogId: req.query.catalogId as string,
      user: { id: member.userId, name: member.user.name, email: member.user.email ?? '' },
      requisitionId: body.requisitionId,
    });
    res.status(200).json({ data: result });
  } catch (error) {
    handleApiError(res, error);
  }
}
