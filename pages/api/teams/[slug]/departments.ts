import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listDepartments, createDepartment } from 'models/department';
import { validateWithSchema } from '@/lib/zod';

const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  costCenter: z.string().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'department', 'read');
      res.status(200).json({ data: await listDepartments(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'department', 'create');
      const params = validateWithSchema(createSchema, req.body);
      res.status(201).json({ data: await createDepartment({ teamId: teamMember.teamId, ...params }) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
