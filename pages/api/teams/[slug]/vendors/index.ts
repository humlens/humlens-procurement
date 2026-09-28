import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { ApiError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { listVendors, createVendor } from 'models/vendor';
import { validateWithSchema, createVendorSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'vendor', 'read');
      const { status, search } = req.query;
      res.status(200).json({
        data: await listVendors(teamMember.teamId, {
          status: status as any,
          search: search as string | undefined,
        }),
      });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'vendor', 'create');
      const { activate, ...params } = validateWithSchema(createVendorSchema, req.body);
      if (activate && !can(teamMember.role, 'vendor', 'update')) {
        throw new ApiError(403, 'You do not have permission to approve vendors.');
      }
      const vendor = await createVendor({
        teamId: teamMember.teamId,
        createdById: teamMember.userId,
        ...params,
        ...(activate ? { status: 'ACTIVE' as const } : {}),
      });
      res.status(201).json({ data: vendor });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
