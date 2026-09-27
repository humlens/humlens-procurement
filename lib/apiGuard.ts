import type { NextApiRequest, NextApiResponse } from 'next';

import { throwIfNoTeamAccess } from 'models/team';
import { can, Action, Resource } from '@/lib/permissions';
import { ApiError } from '@/lib/errors';

// Resolves team membership for req.query.slug and checks the member's role
// against the requested resource/action. Throws ApiError(403) on denial so
// route handlers can just await this and proceed.
export async function guardTeamAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  resource: Resource,
  action: Action
) {
  const teamMember = await throwIfNoTeamAccess(req, res);

  if (!can(teamMember.role, resource, action)) {
    throw new ApiError(403, `You do not have permission to ${action} ${resource}.`);
  }

  return teamMember;
}

export function handleApiError(res: NextApiResponse, error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Something went wrong';
  res.status(status).json({ error: { message } });
}
