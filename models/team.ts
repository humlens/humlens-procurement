import { prisma } from '@/lib/prisma';
import { Role, Team } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';

import { getSession } from '@/lib/session';
import { ApiError } from '@/lib/errors';
import { validateWithSchema, teamSlugSchema } from '@/lib/zod';

const slugify = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const createTeam = async (params: { userId: string; name: string }) => {
  const { userId, name } = params;

  const baseSlug = slugify(name) || 'team';
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.team.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`;
  }

  const team = await prisma.team.create({
    data: { name, slug },
  });

  await addTeamMember(team.id, userId, Role.OWNER);
  await prisma.agentPolicy.create({ data: { teamId: team.id } });

  return team;
};

export const getTeam = async (key: { id: string } | { slug: string }) => {
  return prisma.team.findUniqueOrThrow({ where: key });
};

export const findTeamBySlug = async (slug: string): Promise<Team | null> => {
  return prisma.team.findUnique({ where: { slug } });
};

export const addTeamMember = async (teamId: string, userId: string, role: Role) => {
  return prisma.teamMember.upsert({
    create: { teamId, userId, role },
    update: { role },
    where: { teamId_userId: { teamId, userId } },
  });
};

export const removeTeamMember = async (teamId: string, userId: string) => {
  return prisma.teamMember.delete({
    where: { teamId_userId: { teamId, userId } },
  });
};

export const getTeams = async (userId: string) => {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      team: {
        include: { _count: { select: { members: true } } },
      },
    },
  });

  return memberships.map((m) => ({ ...m.team, myRole: m.role }));
};

export const getTeamMembers = async (slug: string) => {
  const members = await prisma.teamMember.findMany({
    where: { team: { slug } },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      department: true,
    },
  });

  return members;
};

export const updateTeam = async (slug: string, data: Partial<Team>) => {
  return prisma.team.update({ where: { slug }, data });
};

export const isTeamExists = async (slug: string) => {
  return prisma.team.count({ where: { slug } });
};

// Get the current user's TeamMember row for a given team slug, including
// team info. Used by every API route that scopes data to a tenant.
export const getTeamMember = async (userId: string, slug: string) => {
  try {
    return await prisma.teamMember.findFirstOrThrow({
      where: { userId, team: { slug } },
      include: { team: true },
    });
  } catch (err: any) {
    if (err?.code === 'P2025' || err?.name === 'NotFoundError') {
      throw new ApiError(
        403,
        'You do not have access to this team. Please check that you are a member or contact your team owner.'
      );
    }
    throw err;
  }
};

// Resolves the requesting user's session + their TeamMember for the team
// named in `req.query.slug`. Every procurement API route calls this first.
export const throwIfNoTeamAccess = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await getSession(req, res);

  if (!session) {
    throw new ApiError(401, 'Unauthorized');
  }

  const { slug } = validateWithSchema(teamSlugSchema, req.query);
  const teamMember = await getTeamMember(session.user.id, slug);

  return {
    ...teamMember,
    user: { ...session.user },
  };
};
