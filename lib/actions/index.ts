import { Role, type Role as RoleType } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { applyInvoiceMatch } from './invoice';
import { approveRequisitionStep, createDraftRequisition } from './requisition';
import type { ActionContext, AnyActionDefinition } from './types';

export type { ActionContext, EditableField } from './types';

// Every change an agent can propose, keyed by name. Add new actions here.
const registry: Record<string, AnyActionDefinition> = Object.fromEntries(
  [approveRequisitionStep, createDraftRequisition, applyInvoiceMatch].map((action) => [action.name, action])
);

export function getAction(name: string) {
  const action = registry[name];
  if (!action) throw new ApiError(400, `Unknown action "${name}".`);
  return action;
}

export const actionNames = () => Object.keys(registry);

/** Validates arguments against the action's schema, returning the parsed input. */
export function parseArgs(name: string, args: unknown) {
  const parsed = getAction(name).input.safeParse(args);
  if (!parsed.success) {
    throw new ApiError(422, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  return parsed.data;
}

export function canRun(role: RoleType, name: string) {
  const action = getAction(name);
  return can(role, action.resource, action.permission);
}

/** Runs an action directly (not through an agent proposal), checking the caller's role. */
export async function runAction(name: string, ctx: ActionContext & { role: RoleType }, args: unknown) {
  const action = getAction(name);
  if (!canRun(ctx.role, name)) {
    throw new ApiError(403, `You do not have permission to ${action.permission} ${action.resource}.`);
  }
  return action.apply(ctx, parseArgs(name, args));
}

// The person agents act as when they apply a change on their own: the
// team's longest-standing owner, so every record names someone
// accountable. AgentAction still records that the agent did it.
export async function agentActorId(teamId: string) {
  const owner =
    (await prisma.teamMember.findFirst({ where: { teamId, role: Role.OWNER }, orderBy: { createdAt: 'asc' }, select: { userId: true } })) ??
    (await prisma.teamMember.findFirst({ where: { teamId }, orderBy: { createdAt: 'asc' }, select: { userId: true } }));
  if (!owner) throw new ApiError(500, 'This team has no members for the agent to act as.');
  return owner.userId;
}
