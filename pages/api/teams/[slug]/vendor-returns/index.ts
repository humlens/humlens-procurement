import type { NextApiRequest, NextApiResponse } from 'next';
import type { VendorReturnStatus } from '@prisma/client';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listVendorReturns } from 'models/vendorReturn';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'vendor_return', 'read');
      res.status(200).json({
        data: await listVendorReturns(teamMember.teamId, {
          status: req.query.status as VendorReturnStatus | undefined,
          poId: req.query.poId as string | undefined,
          receiptId: req.query.receiptId as string | undefined,
        }),
      });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
