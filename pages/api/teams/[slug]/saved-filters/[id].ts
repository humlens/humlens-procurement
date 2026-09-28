import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { handleApiError } from '@/lib/apiGuard';
import { advancedFilterSchema } from '@/lib/advancedFilter';
import { validateWithSchema } from '@/lib/zod';
import { throwIfNoTeamAccess } from 'models/team';
import { deleteSavedFilter, updateSavedFilter } from 'models/savedFilter';

const updateSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the filter a name.').max(80).optional(),
    filter: advancedFilterSchema.optional(),
    shared: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update.');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  try {
    const member = await throwIfNoTeamAccess(req, res);

    if (req.method === 'PUT') {
      const body = validateWithSchema(updateSchema, req.body);
      res.status(200).json({ data: await updateSavedFilter(member.teamId, id, member, body) });
      return;
    }

    if (req.method === 'DELETE') {
      await deleteSavedFilter(member.teamId, id, member);
      res.status(204).end();
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
