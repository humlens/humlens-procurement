import { prisma } from '@/lib/prisma';

export const listAuditLogs = async (teamId: string, options: { cursor?: string; limit?: number } = {}) => {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);

  const entries = await prisma.auditLog.findMany({
    where: { teamId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    include: { actor: { select: { email: true } } },
  });

  const hasMore = entries.length > limit;
  const page = hasMore ? entries.slice(0, limit) : entries;

  return {
    entries: page.map(({ actor, ...entry }) => ({ ...entry, actorEmail: actor?.email ?? null })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
};
