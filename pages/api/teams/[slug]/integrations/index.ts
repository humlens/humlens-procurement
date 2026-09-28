import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { ApiError } from '@/lib/errors';
import {
  ConnectionError,
  callConnectedApp,
  deleteConnection,
  getConnection,
  listConnections,
  normaliseAppUrl,
  saveConnection,
} from '@/lib/connections';
import { integrationsConfig } from '@/lib/integrationsConfig';
import { listOutboundEvents, outboxHealth } from '@/lib/outbox';
import { validateWithSchema } from '@/lib/zod';

const saveSchema = z.object({
  url: z.string().trim().min(1, 'Enter the app’s address.').max(500),
  apiKey: z.string().trim().max(200).optional(),
  options: z.record(z.union([z.boolean(), z.string()])).default({}),
});

// GET: connections, delivery health and recent messages. PUT: connect (or
// update) the other app after checking the address and key work. DELETE:
// disconnect it.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const member = await guardTeamAccess(req, res, 'team', 'read');
      const [connections, health, events] = await Promise.all([
        listConnections(member.teamId),
        outboxHealth(member.teamId),
        listOutboundEvents(member.teamId, { limit: 50 }),
      ]);
      res.status(200).json({ data: { connections, health, events } });
      return;
    }

    if (req.method === 'PUT') {
      const member = await guardTeamAccess(req, res, 'team', 'update');
      setAuditEvent(res, { resource: 'integration', action: 'connect' });
      const body = validateWithSchema(saveSchema, req.body);
      const url = normaliseAppUrl(body.url);
      if (!url) throw new ApiError(422, 'Enter a valid http(s) address, e.g. https://procurement.example.com.');

      const existing = await getConnection(member.teamId, integrationsConfig.target);
      const apiKey = body.apiKey || existing?.secret;
      if (!apiKey) throw new ApiError(422, 'Enter an API key.');
      if (body.apiKey && !body.apiKey.startsWith(integrationsConfig.keyPrefix)) {
        throw new ApiError(422, `That doesn’t look like a ${integrationsConfig.targetName} key (they start with ${integrationsConfig.keyPrefix}).`);
      }

      // Prove the address and key work before saving them.
      let team: { name: string };
      try {
        ({ data: team } = await callConnectedApp<{ data: { name: string } }>(
          { id: 'test', kind: integrationsConfig.target, url, secret: apiKey, options: {} },
          '/team'
        ));
      } catch (error) {
        throw new ApiError(422, error instanceof ConnectionError ? error.message : 'Could not reach the app.');
      }

      const options = Object.fromEntries(
        integrationsConfig.toggles.map((toggle) => [toggle.key, body.options[toggle.key] ?? toggle.default])
      );
      await saveConnection({ teamId: member.teamId, kind: integrationsConfig.target, url, secret: apiKey, options, createdById: member.userId });
      res.status(200).json({ data: { connectedTo: team.name } });
      return;
    }

    if (req.method === 'DELETE') {
      const member = await guardTeamAccess(req, res, 'team', 'update');
      setAuditEvent(res, { resource: 'integration', action: 'disconnect' });
      const kind = z.enum(['INVENTORY', 'PROCUREMENT', 'COMMERCE']).parse(req.query.kind);
      await deleteConnection(member.teamId, kind);
      res.status(204).end();
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
