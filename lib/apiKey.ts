import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { can, Action, Resource } from '@/lib/permissions';
import { auditOnSuccess } from '@/lib/audit';

export const API_KEY_PREFIX = 'hprc_';

export const hashApiKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

// Server-to-server auth for /api/v1: `Authorization: Bearer <key>`. A key acts
// as the member who created it, with that member's current role, so revoking
// the member or lowering their role takes effect on the key too. Writes are
// audit-logged under that member, with source API_KEY.
export async function guardApiKey(req: NextApiRequest, res: NextApiResponse, resource: Resource, action: Action) {
  const header = req.headers.authorization ?? '';
  const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!raw.startsWith(API_KEY_PREFIX)) throw new ApiError(401, 'Missing or invalid API key.');

  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(raw) }, include: { team: true } });
  if (!key || key.revokedAt) throw new ApiError(401, 'Missing or invalid API key.');

  const member = await prisma.teamMember.findFirst({
    where: { teamId: key.teamId, userId: key.createdById },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!member) throw new ApiError(401, 'The member who created this API key has left the team. Create a new key.');
  if (!can(member.role, resource, action)) {
    throw new ApiError(403, `This API key's owner does not have permission to ${action} ${resource}.`);
  }

  // At most one write a minute per key.
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }

  auditOnSuccess(req, res, { teamId: key.teamId, actor: member.user, source: 'API_KEY', resource, action });

  return { teamId: key.teamId, team: key.team, actorId: key.createdById, role: member.role };
}

export function handleV1Error(res: NextApiResponse, error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof ApiError ? error.message : 'Something went wrong.';
  if (!(error instanceof ApiError)) console.error('API v1 error', error);
  res.status(status).json({ error: { message } });
}
