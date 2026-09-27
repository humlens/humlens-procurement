import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listGoodsReceipts, createGoodsReceipt } from 'models/receipt';
import { validateWithSchema, createGoodsReceiptSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'goods_receipt', 'read');
      res.status(200).json({
        data: await listGoodsReceipts(teamMember.teamId, req.query.poId as string | undefined),
      });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'goods_receipt', 'create');
      const params = validateWithSchema(createGoodsReceiptSchema, req.body);
      const receipt = await createGoodsReceipt({
        teamId: teamMember.teamId,
        receivedById: teamMember.userId,
        ...params,
      });
      res.status(201).json({ data: receipt });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
