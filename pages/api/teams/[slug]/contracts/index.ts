import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listContracts, createContract } from 'models/contract';
import { validateWithSchema, createContractSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'contract', 'read');
      res.status(200).json({ data: await listContracts(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'contract', 'create');
      const params = validateWithSchema(createContractSchema, req.body);
      const contract = await createContract({
        teamId: teamMember.teamId,
        createdById: teamMember.userId,
        vendorId: params.vendorId,
        rfqId: params.rfqId,
        title: params.title,
        value: params.value,
        currency: params.currency,
        startDate: new Date(params.startDate),
        endDate: params.endDate ? new Date(params.endDate) : undefined,
        autoRenew: params.autoRenew,
        documentUrl: params.documentUrl || undefined,
      });
      res.status(201).json({ data: contract });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
