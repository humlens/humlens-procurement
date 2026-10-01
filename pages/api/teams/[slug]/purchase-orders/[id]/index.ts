import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { getPurchaseOrder, setPurchaseOrderDeliveryDate } from 'models/purchaseOrder';
import { validateWithSchema, updatePurchaseOrderSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'purchase_order', 'read');
      res.status(200).json({ data: await getPurchaseOrder(teamMember.teamId, req.query.id as string) });
      return;
    }

    if (req.method === 'PUT') {
      const teamMember = await guardTeamAccess(req, res, 'purchase_order', 'update');
      const { expectedDeliveryDate } = validateWithSchema(updatePurchaseOrderSchema, req.body);
      await setPurchaseOrderDeliveryDate(teamMember.teamId, req.query.id as string, expectedDeliveryDate);
      res.status(200).json({ data: await getPurchaseOrder(teamMember.teamId, req.query.id as string) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
