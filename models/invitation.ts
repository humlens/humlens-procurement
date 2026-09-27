import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';

export const createInvitation = async (params: {
  teamId: string;
  email: string;
  role: Role;
  invitedBy: string;
}) => {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  return prisma.invitation.upsert({
    where: { teamId_email: { teamId: params.teamId, email: params.email } },
    create: { ...params, token: randomUUID(), expires },
    update: { role: params.role, token: randomUUID(), expires },
  });
};

export const listInvitations = async (teamId: string) => {
  return prisma.invitation.findMany({ where: { teamId }, orderBy: { createdAt: 'desc' } });
};

export const acceptInvitation = async (token: string, userId: string) => {
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { token } });

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: invitation.teamId, userId } },
    create: { teamId: invitation.teamId, userId, role: invitation.role },
    update: { role: invitation.role },
  });

  await prisma.invitation.delete({ where: { token } });

  return invitation;
};
