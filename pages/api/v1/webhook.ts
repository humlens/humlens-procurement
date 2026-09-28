import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardApiKey, handleV1Error } from '@/lib/apiKey';
import { setAuditEvent } from '@/lib/audit';
import { deleteConnection, normaliseAppUrl, saveConnection } from '@/lib/connections';
import { validateWithSchema } from '@/lib/zod';

const bodySchema = z.object({
  url: z.string().trim().min(1).max(500),
  secret: z.string().min(32).max(200),
});

// PUT /api/v1/webhook — a connected store registers where to be told about
// changes (stock, reservations) and the key that signs those messages.
// DELETE removes it. The key's owner must be able to change team settings.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'PUT') {
      const { teamId, actorId } = await guardApiKey(req, res, 'team', 'update');
      setAuditEvent(res, { resource: 'store_webhook', action: 'register' });
      const body = validateWithSchema(bodySchema, req.body);
      const url = normaliseAppUrl(body.url);
      if (!url) return res.status(422).json({ error: { message: 'Enter a valid http(s) address.' } });
      await saveConnection({ teamId, kind: 'COMMERCE', url, secret: body.secret, createdById: actorId });
      res.status(200).json({ data: { registered: true, url } });
      return;
    }
    if (req.method === 'DELETE') {
      const { teamId } = await guardApiKey(req, res, 'team', 'update');
      setAuditEvent(res, { resource: 'store_webhook', action: 'remove' });
      await deleteConnection(teamId, 'COMMERCE');
      res.status(204).end();
      return;
    }
    res.status(405).end();
  } catch (error) {
    handleV1Error(res, error);
  }
}
