import { ApiError } from '@/lib/errors';
import { can, Action, Resource } from '@/lib/permissions';
import { getUserByEmail } from 'models/user';
import { getTeamMember } from 'models/team';
import { recordAudit } from '@/lib/audit';

// Every MCP tool call authenticates as a real team member, resolved from
// the caller-supplied email — there's no separate "service account" concept,
// so agent actions taken via MCP are attributable to the same person a UI
// action would be, and are subject to the same RBAC checks.
export async function resolveMcpActor(teamSlug: string, actingUserEmail: string) {
  const user = await getUserByEmail(actingUserEmail);
  if (!user) {
    throw new ApiError(404, `No user found for ${actingUserEmail}.`);
  }

  const teamMember = await getTeamMember(user.id, teamSlug);
  return { user, teamMember, team: teamMember.team };
}

export async function guardMcpAction(
  teamSlug: string,
  actingUserEmail: string,
  resource: Resource,
  action: Action
) {
  const actor = await resolveMcpActor(teamSlug, actingUserEmail);
  if (!can(actor.teamMember.role, resource, action)) {
    throw new ApiError(403, `${actingUserEmail} does not have permission to ${action} ${resource}.`);
  }
  return actor;
}

// Wraps a write tool's result: once it resolves, records the audit entry
// under the acting member, with source MCP. Pass `targetId` when the tool
// returns something other than the record it changed.
export async function auditMcp<T>(
  actor: Awaited<ReturnType<typeof resolveMcpActor>>,
  resource: Resource,
  action: Action,
  result: Promise<T>,
  targetId?: string
) {
  const value = await result;
  const target = (value ?? {}) as { id?: unknown; name?: unknown; title?: unknown; poNumber?: unknown };
  const label = [target.name, target.title, target.poNumber].find((v): v is string => typeof v === 'string');
  await recordAudit({
    teamId: actor.team.id,
    actor: actor.user,
    source: 'MCP',
    resource,
    action,
    targetId: targetId ?? (typeof target.id === 'string' ? target.id : null),
    targetLabel: label ?? null,
  });
  return value;
}
