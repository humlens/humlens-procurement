import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { getSession } from '@/lib/session';
import { handleApiError } from '@/lib/apiGuard';
import { ApiError } from '@/lib/errors';
import { tableKeySchema, validateWithSchema } from '@/lib/zod';
import { advancedFilterSchema } from '@/lib/advancedFilter';
import { deleteTablePreference, getTablePreference, saveTablePreference } from 'models/tablePreference';

// A table is identified by its page route (e.g. "/teams/[slug]/items"), so a
// saved layout applies to that page in every team the user belongs to.
const querySchema = z.object({ table: tableKeySchema });

const columnId = z.string().max(100);

const viewSchema = z.object({
  columnVisibility: z.record(columnId, z.boolean()).optional(),
  columnOrder: z.array(columnId).max(100).optional(),
  columnSizing: z.record(columnId, z.number().min(0).max(4000)).optional(),
  columnPinning: z.object({ start: z.array(columnId).max(100).optional(), end: z.array(columnId).max(100).optional() }).optional(),
  sorting: z.array(z.object({ id: columnId, desc: z.boolean() })).max(20).optional(),
  grouping: z.array(columnId).max(10).optional(),
  filter: advancedFilterSchema.optional(),
  activeFilterId: z.string().uuid().optional(),
  defaultFilterId: z.string().uuid().optional(),
  pageSize: z.number().int().min(1).max(1000).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
});

const bodySchema = z.object({ view: viewSchema });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getSession(req, res);
    if (!session) throw new ApiError(401, 'Unauthorized');

    const { table } = validateWithSchema(querySchema, req.query);
    const userId = session.user.id;

    if (req.method === 'GET') {
      res.status(200).json({ data: await getTablePreference(userId, table) });
      return;
    }

    if (req.method === 'PUT') {
      const { view } = validateWithSchema(bodySchema, req.body);
      res.status(200).json({ data: await saveTablePreference(userId, table, view) });
      return;
    }

    if (req.method === 'DELETE') {
      await deleteTablePreference(userId, table);
      res.status(204).end();
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
