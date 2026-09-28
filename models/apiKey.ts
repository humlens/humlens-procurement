import crypto from 'crypto';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { API_KEY_PREFIX, hashApiKey } from '@/lib/apiKey';

export const listApiKeys = async (teamId: string) => {
  const keys = await prisma.apiKey.findMany({
    where: { teamId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, prefix: true, createdById: true, lastUsedAt: true, createdAt: true },
  });
  const creators = await prisma.user.findMany({
    where: { id: { in: [...new Set(keys.map((key) => key.createdById))] } },
    select: { id: true, name: true, email: true },
  });
  return keys.map((key) => ({ ...key, createdBy: creators.find((user) => user.id === key.createdById) ?? null }));
};

// Returns the key itself exactly once; only its hash is stored.
export const createApiKey = async (params: { teamId: string; name: string; createdById: string }) => {
  const key = `${API_KEY_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
  const record = await prisma.apiKey.create({
    data: {
      teamId: params.teamId,
      name: params.name,
      prefix: key.slice(0, API_KEY_PREFIX.length + 4),
      keyHash: hashApiKey(key),
      createdById: params.createdById,
    },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });
  return { ...record, key };
};

export const revokeApiKey = async (teamId: string, id: string) => {
  const key = await prisma.apiKey.findFirst({ where: { id, teamId, revokedAt: null } });
  if (!key) throw new ApiError(404, 'API key not found.');
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
};
