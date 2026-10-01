import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { cancelVendorReturn, markVendorReturnSent, recordVendorReturnCredit } from 'models/vendorReturn';
import { refreshVendorScorecard } from 'models/vendor';
import { validateWithSchema, vendorReturnActionSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const params = validateWithSchema(vendorReturnActionSchema, req.body);
    const teamMember = await guardTeamAccess(req, res, 'vendor_return', 'update');
    setAuditEvent(res, { resource: 'vendor_return', action: params.action });
    const id = req.query.id as string;

    const vendorReturn =
      params.action === 'send'
        ? await markVendorReturnSent(teamMember.teamId, id)
        : params.action === 'credit'
          ? await recordVendorReturnCredit(teamMember.teamId, id, { amount: params.amount, reference: params.reference })
          : await cancelVendorReturn(teamMember.teamId, id);

    // The scorecard's comment mentions credits and open returns.
    if (params.action !== 'send') void refreshVendorScorecard(teamMember.teamId, vendorReturn.vendorId)
      .catch((error) => console.error('Vendor scorecard refresh failed', error));
    res.status(200).json({ data: vendorReturn });
  } catch (error) {
    handleApiError(res, error);
  }
}
