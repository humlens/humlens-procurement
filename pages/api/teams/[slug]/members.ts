import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { Role } from '@prisma/client';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { getTeamMembers } from 'models/team';
import { createInvitation, listInvitations } from 'models/invitation';
import { validateWithSchema } from '@/lib/zod';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(Role).default(Role.REQUESTER),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'team_member', 'read');
      const [members, invitations] = await Promise.all([
        getTeamMembers(teamMember.team.slug),
        listInvitations(teamMember.teamId),
      ]);
      res.status(200).json({ data: { members, invitations } });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'team_invitation', 'invite');
      const { email, role } = validateWithSchema(inviteSchema, req.body);
      const invitation = await createInvitation({
        teamId: teamMember.teamId,
        email,
        role,
        invitedBy: teamMember.userId,
      });
      res.status(201).json({ data: invitation });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
