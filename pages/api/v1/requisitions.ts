import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardApiKey, handleV1Error } from '@/lib/apiKey';
import { validateWithSchema } from '@/lib/zod';
import { listRequisitionsForSync, raiseRequisition } from 'models/storeSync';

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  justification: z.string().max(2000).optional(),
  departmentId: z.string().optional(),
  neededBy: z.string().datetime({ offset: true }).optional(),
  externalReference: z.string().trim().min(1).max(200),
  submit: z.boolean().default(false),
  lines: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(100),
        description: z.string().trim().min(1).max(500),
        quantity: z.number().positive(),
        unit: z.string().max(30).optional(),
        estimatedPrice: z.number().nonnegative(),
      })
    )
    .min(1)
    .max(100),
});

const listSchema = z.object({ ids: z.string().optional(), references: z.string().optional() });
const split = (value?: string) => value?.split(',').map((part) => part.trim()).filter(Boolean).slice(0, 200);

// POST /api/v1/requisitions — raise a purchase request (idempotent by externalReference).
// GET  /api/v1/requisitions?ids=&references= — where requests stand, and their PO.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'POST') {
      const body = validateWithSchema(createSchema, req.body);
      const { teamId, actorId } = await guardApiKey(req, res, 'requisition', body.submit ? 'submit' : 'create');
      const result = await raiseRequisition({ teamId, actorId, ...body, neededBy: body.neededBy ? new Date(body.neededBy) : undefined });
      res.status(result.created ? 201 : 200).json({ data: result });
      return;
    }

    if (req.method === 'GET') {
      const { teamId } = await guardApiKey(req, res, 'requisition', 'read');
      const query = validateWithSchema(listSchema, req.query);
      res.status(200).json({ data: await listRequisitionsForSync(teamId, { ids: split(query.ids), references: split(query.references) }) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleV1Error(res, error);
  }
}
