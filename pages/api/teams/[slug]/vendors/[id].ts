import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { getVendor, updateVendor, setVendorStatus, addVendorPerformanceReview } from 'models/vendor';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'vendor', 'read');
      res.status(200).json({ data: await getVendor(teamMember.teamId, id) });
      return;
    }

    if (req.method === 'PUT') {
      const teamMember = await guardTeamAccess(req, res, 'vendor', 'update');

      if (req.body.status) {
        res.status(200).json({ data: await setVendorStatus(teamMember.teamId, id, req.body.status) });
        return;
      }
      if (req.body.review) {
        res.status(200).json({
          data: await addVendorPerformanceReview({ teamId: teamMember.teamId, vendorId: id, ...req.body.review }),
        });
        return;
      }

      res.status(200).json({ data: await updateVendor(teamMember.teamId, id, req.body) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
