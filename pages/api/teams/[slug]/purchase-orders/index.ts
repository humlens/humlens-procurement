import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listPurchaseOrders, createPurchaseOrder } from 'models/purchaseOrder';
import { validateWithSchema, createPurchaseOrderSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'purchase_order', 'read');
      res.status(200).json({
        data: await listPurchaseOrders(teamMember.teamId, { status: req.query.status as any }),
      });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'purchase_order', 'create');
      const params = validateWithSchema(createPurchaseOrderSchema, req.body);
      const po = await createPurchaseOrder({
        teamId: teamMember.teamId,
        createdById: teamMember.userId,
        ...params,
      });
      res.status(201).json({ data: po });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
