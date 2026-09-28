import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { handleApiError } from '@/lib/apiGuard';
import { advancedFilterSchema } from '@/lib/advancedFilter';
import { tableKeySchema, validateWithSchema } from '@/lib/zod';
import { throwIfNoTeamAccess } from 'models/team';
import { createSavedFilter, listSavedFilters } from 'models/savedFilter';

const createSchema = z.object({
  tableKey: tableKeySchema,
  name: z.string().trim().min(1, 'Give the filter a name.').max(80),
  filter: advancedFilterSchema,
  shared: z.boolean().default(false),
});

// Saved filters are UI metadata over data the member can already read, so
// any member of the team can keep their own and share them.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const member = await throwIfNoTeamAccess(req, res);

    if (req.method === 'GET') {
      const { table } = validateWithSchema(z.object({ table: tableKeySchema }), req.query);
      res.status(200).json({ data: await listSavedFilters(member.teamId, member.userId, table) });
      return;
    }

    if (req.method === 'POST') {
      const body = validateWithSchema(createSchema, req.body);
      res.status(201).json({ data: await createSavedFilter({ teamId: member.teamId, userId: member.userId, ...body }) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
