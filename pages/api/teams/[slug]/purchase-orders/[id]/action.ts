import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { approvePurchaseOrder, issuePurchaseOrder, cancelPurchaseOrder, getPurchaseOrder } from 'models/purchaseOrder';
import { validateWithSchema } from '@/lib/zod';
import { ApiError } from '@/lib/errors';

const actionSchema = z.object({ action: z.enum(['approve', 'issue', 'cancel']) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const { action } = validateWithSchema(actionSchema, req.body);
    const permAction = action === 'approve' ? 'approve' : action === 'issue' ? 'issue' : 'delete';
    const teamMember = await guardTeamAccess(req, res, 'purchase_order', permAction);
    const id = req.query.id as string;

    if (action === 'approve') {
      await approvePurchaseOrder(teamMember.teamId, id, teamMember.userId);
    } else if (action === 'issue') {
      await issuePurchaseOrder(teamMember.teamId, id);
    } else if (action === 'cancel') {
      await cancelPurchaseOrder(teamMember.teamId, id);
    } else {
      throw new ApiError(400, 'Unknown action');
    }

    res.status(200).json({ data: await getPurchaseOrder(teamMember.teamId, id) });
  } catch (error) {
    handleApiError(res, error);
  }
}
