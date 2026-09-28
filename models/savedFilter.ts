import type { Prisma, Role } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';

export const MAX_SAVED_FILTERS_PER_TABLE = 50;

const select = {
  id: true,
  name: true,
  tableKey: true,
  filter: true,
  shared: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true, email: true } },
} as const;

// A member sees their own filters for the page plus everything shared with
// the team.
export const listSavedFilters = async (teamId: string, userId: string, tableKey: string) => {
  const filters = await prisma.savedFilter.findMany({
    where: { teamId, tableKey, OR: [{ createdById: userId }, { shared: true }] },
    orderBy: [{ name: 'asc' }],
    select,
  });
  return filters.map((filter) => ({ ...filter, mine: filter.createdById === userId }));
};

export const createSavedFilter = async (params: {
  teamId: string;
  userId: string;
  tableKey: string;
  name: string;
  filter: Prisma.InputJsonValue;
  shared: boolean;
}) => {
  const count = await prisma.savedFilter.count({
    where: { teamId: params.teamId, createdById: params.userId, tableKey: params.tableKey },
  });
  if (count >= MAX_SAVED_FILTERS_PER_TABLE) {
    throw new ApiError(400, `You can save up to ${MAX_SAVED_FILTERS_PER_TABLE} filters per page. Delete one first.`);
  }
  const created = await prisma.savedFilter.create({
    data: {
      teamId: params.teamId,
      createdById: params.userId,
      tableKey: params.tableKey,
      name: params.name,
      filter: params.filter,
      shared: params.shared,
    },
    select,
  });
  return { ...created, mine: true };
};

// The creator can change or delete their filter. Owners and admins can also
// delete (not edit) filters others have shared with the team.
async function findEditable(teamId: string, id: string, member: { userId: string; role: Role }, intent: 'update' | 'delete') {
  const existing = await prisma.savedFilter.findFirst({ where: { id, teamId }, select: { createdById: true, shared: true } });
  if (!existing || (existing.createdById !== member.userId && !existing.shared)) {
    throw new ApiError(404, 'Saved filter not found.');
  }
  const isCreator = existing.createdById === member.userId;
  const isManager = member.role === 'OWNER' || member.role === 'ADMIN';
  if (!isCreator && !(intent === 'delete' && isManager)) {
    throw new ApiError(403, intent === 'delete' ? 'Only its creator or a team admin can delete this filter.' : 'Only its creator can change this filter.');
  }
}

export const updateSavedFilter = async (
  teamId: string,
  id: string,
  member: { userId: string; role: Role },
  data: { name?: string; filter?: Prisma.InputJsonValue; shared?: boolean }
) => {
  await findEditable(teamId, id, member, 'update');
  const updated = await prisma.savedFilter.update({ where: { id }, data, select });
  return { ...updated, mine: true };
};

export const deleteSavedFilter = async (teamId: string, id: string, member: { userId: string; role: Role }) => {
  await findEditable(teamId, id, member, 'delete');
  await prisma.savedFilter.delete({ where: { id } });
};
