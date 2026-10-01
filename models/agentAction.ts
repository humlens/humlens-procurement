import { AgentActionStatus, AgentActionType, Prisma, type AgentAction, type Role } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { agentActorId, canRun, getAction, parseArgs } from '@/lib/actions';

// The life of an agent action (the same model as Humlens Inventory's). A change (a row with a `tool`) is proposed,
// then applied by the agent itself when policy allows or by a person who
// approves it, and can be undone afterwards. A finding (no `tool`) is just
// something for people to read and mark as seen.

export type Evidence = { label: string; value: string | number }[];

export const listAgentActions = async (teamId: string, limit = 50) => {
  return prisma.agentAction.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { reviewedBy: { select: { id: true, name: true } } },
  });
};

/** Records a finding or something already done outside the registry. */
export const logAgentAction = async (params: {
  teamId: string;
  type: AgentActionType;
  status: AgentActionStatus;
  agent?: string;
  title?: string;
  requisitionId?: string;
  purchaseOrderId?: string;
  invoiceId?: string;
  input?: Prisma.InputJsonValue;
  output?: Prisma.InputJsonValue;
  evidence?: Evidence;
  reasoning?: string;
  confidence?: number;
  aiModel?: string;
  aiTokens?: number;
  reviewedAt?: Date;
}) => {
  return prisma.agentAction.create({
    data: {
      ...params,
      input: params.input ?? {},
      output: params.output ?? {},
      evidence: params.evidence ?? [],
    },
  });
};

/**
 * Proposes a change through the action registry. With `autoApply` (the
 * agent's policy allows it) the change is applied straight away; otherwise it
 * waits in the inbox for someone to approve, edit or dismiss.
 */
export const proposeAction = async (params: {
  teamId: string;
  type: AgentActionType;
  agent: string;
  tool: string;
  args: unknown;
  reasoning: string;
  requisitionId?: string;
  purchaseOrderId?: string;
  invoiceId?: string;
  evidence?: Evidence;
  confidence?: number;
  requestedById?: string;
  /** Apply as this person instead of the team owner (a requester's own draft). */
  actAs?: string;
  aiModel?: string;
  aiTokens?: number;
  autoApply?: boolean;
}) => {
  const action = getAction(params.tool);
  const args = parseArgs(params.tool, params.args);
  const row = await prisma.agentAction.create({
    data: {
      teamId: params.teamId,
      type: params.type,
      status: 'PROPOSED',
      agent: params.agent,
      title: await action.describe(params.teamId, args),
      tool: params.tool,
      args: args as Prisma.InputJsonValue,
      requisitionId: params.requisitionId,
      purchaseOrderId: params.purchaseOrderId,
      invoiceId: params.invoiceId,
      evidence: params.evidence ?? [],
      reasoning: params.reasoning,
      confidence: params.confidence,
      requestedById: params.requestedById,
      aiModel: params.aiModel,
      aiTokens: params.aiTokens,
    },
  });
  if (!params.autoApply) return row;

  try {
    return await applyClaimed(row, params.actAs ?? (await agentActorId(params.teamId)), params.actAs ?? null);
  } catch (error) {
    return prisma.agentAction.update({
      where: { id: row.id },
      data: { status: 'FAILED', error: error instanceof Error ? error.message : 'The change could not be applied.' },
    });
  }
};

// Claims the row (so two clicks can't apply it twice), runs the action and
// records what it produced. `appliedById` is null when the agent applied it.
async function applyClaimed(row: AgentAction, actingUserId: string, appliedById: string | null, args?: unknown, role?: Role) {
  const claimed = await prisma.agentAction.updateMany({
    where: { id: row.id, status: { in: ['PROPOSED', 'FAILED'] }, appliedAt: null },
    data: { appliedAt: new Date() },
  });
  if (claimed.count === 0) throw new ApiError(409, 'This action has already been handled.');

  const action = getAction(row.tool!);
  const input = parseArgs(row.tool!, args ?? row.args);
  try {
    const result = await action.apply({ teamId: row.teamId, userId: actingUserId, role, source: appliedById ? 'user' : 'agent', agentActionId: row.id }, input);
    const requisitionId = (result as { requisitionId?: string }).requisitionId;
    return await prisma.agentAction.update({
      where: { id: row.id },
      data: {
        status: 'EXECUTED',
        args: input as Prisma.InputJsonValue,
        title: args ? await action.describe(row.teamId, input) : row.title,
        result: result as Prisma.InputJsonValue,
        requisitionId: requisitionId ?? row.requisitionId,
        appliedById,
        error: null,
        ...(appliedById ? { reviewedById: appliedById, reviewedAt: new Date() } : {}),
      },
    });
  } catch (error) {
    // Release the claim so it can be retried, and say why it failed.
    await prisma.agentAction.update({
      where: { id: row.id },
      data: { appliedAt: null, error: error instanceof Error ? error.message : 'The change could not be applied.' },
    });
    throw error;
  }
}

type Reviewer = { userId: string; role: Role };

// Approving needs the right to approve agent actions and the right to make
// the change itself. People may always apply what they asked for themselves
// (a plain-English stock update), as long as they may make that change.
function assertMayHandle(row: AgentAction, reviewer: Reviewer, verb: string) {
  if (!row.tool) throw new ApiError(400, 'This is a finding, not a change.');
  if (!canRun(reviewer.role, row.tool)) {
    const action = getAction(row.tool);
    throw new ApiError(403, `You do not have permission to ${action.permission} ${action.resource}.`);
  }
  if (row.requestedById !== reviewer.userId && !can(reviewer.role, 'agent_action', 'approve')) {
    throw new ApiError(403, `You do not have permission to ${verb} agent actions.`);
  }
}

async function findAction(teamId: string, id: string) {
  const row = await prisma.agentAction.findFirst({ where: { id, teamId } });
  if (!row) throw new ApiError(404, 'Agent action not found.');
  return row;
}

/** Applies a proposed change, optionally with edited numbers or full replacement arguments. */
export const approveAgentAction = async (
  teamId: string,
  id: string,
  reviewer: Reviewer,
  changes?: { edits?: Record<string, number>; args?: unknown }
) => {
  const row = await findAction(teamId, id);
  assertMayHandle(row, reviewer, 'approve');
  const action = getAction(row.tool!);
  let args: unknown = changes?.args;
  if (!args && changes?.edits && action.withEdits) args = action.withEdits(parseArgs(row.tool!, row.args), changes.edits);
  return applyClaimed(row, reviewer.userId, reviewer.userId, args, reviewer.role);
};

export const rejectAgentAction = async (teamId: string, id: string, reviewer: Reviewer) => {
  const row = await findAction(teamId, id);
  assertMayHandle(row, reviewer, 'reject');
  const updated = await prisma.agentAction.updateMany({
    where: { id, status: { in: ['PROPOSED', 'FAILED'] }, appliedAt: null },
    data: { status: 'OVERRIDDEN_BY_HUMAN', reviewedById: reviewer.userId, reviewedAt: new Date() },
  });
  if (updated.count === 0) throw new ApiError(409, 'This action has already been handled.');
  return findAction(teamId, id);
};

/** Reverses an applied change through the action's own undo. */
export const undoAgentAction = async (teamId: string, id: string, reviewer: Reviewer) => {
  const row = await findAction(teamId, id);
  assertMayHandle(row, reviewer, 'undo');
  const action = getAction(row.tool!);
  if (!action.revert) throw new ApiError(400, `“${action.label}” can't be undone automatically.`);
  if (!row.result) throw new ApiError(400, 'There is no record of what this changed, so it cannot be undone.');

  const claimed = await prisma.agentAction.updateMany({
    where: { id, status: 'EXECUTED', revertedAt: null },
    data: { revertedAt: new Date() },
  });
  if (claimed.count === 0) throw new ApiError(409, 'This action is not in a state that can be undone.');

  try {
    await action.revert({ teamId, userId: reviewer.userId, role: reviewer.role, source: 'user', agentActionId: id }, row.result, parseArgs(row.tool!, row.args));
  } catch (error) {
    await prisma.agentAction.update({ where: { id }, data: { revertedAt: null } });
    throw error;
  }
  return prisma.agentAction.update({
    where: { id },
    data: { status: 'REVERTED', revertedById: reviewer.userId, error: null },
  });
};

/** Marks a finding as read so it leaves the inbox. */
export const markAgentActionSeen = async (teamId: string, id: string, userId: string) => {
  await findAction(teamId, id);
  return prisma.agentAction.update({ where: { id }, data: { reviewedById: userId, reviewedAt: new Date() } });
};

// Kept for the older review endpoint: EXECUTED approves, anything else dismisses.
export const reviewAgentAction = async (teamId: string, id: string, reviewer: Reviewer, status: AgentActionStatus) =>
  status === 'EXECUTED' ? approveAgentAction(teamId, id, reviewer) : rejectAgentAction(teamId, id, reviewer);

/** Is there already an open item of this kind about this item? Agents use it to avoid repeating themselves. */
export const hasOpenAgentAction = async (teamId: string, type: AgentActionType, about: { requisitionId?: string; invoiceId?: string }) =>
  (await prisma.agentAction.count({
    where: { teamId, type, ...about, reviewedAt: null, OR: [{ status: { in: ['PROPOSED', 'FAILED'] } }, { tool: null, status: { not: 'OVERRIDDEN_BY_HUMAN' } }] },
  })) > 0;

const DONE_DAYS = 14;

// A proposal can be dealt with outside the inbox (a requisition approved on
// its own page, say). Close those so the inbox only shows what's still open.
async function closeHandledElsewhere(teamId: string) {
  const open = await prisma.agentAction.findMany({
    where: { teamId, tool: { not: null }, status: { in: ['PROPOSED', 'FAILED'] }, reviewedAt: null },
    select: { id: true, tool: true, args: true },
  });
  for (const row of open) {
    const action = getAction(row.tool!);
    if (!action.stillNeeded) continue;
    const args = action.input.safeParse(row.args);
    if (args.success && (await action.stillNeeded(teamId, args.data))) continue;
    await prisma.agentAction.updateMany({
      where: { id: row.id, status: { in: ['PROPOSED', 'FAILED'] }, appliedAt: null },
      data: { status: 'OVERRIDDEN_BY_HUMAN', reviewedAt: new Date(), error: 'Handled outside the inbox.' },
    });
  }
}

export type InboxEntry = ReturnType<typeof toEntry>;

function toEntry(row: AgentAction, names: Map<string, string>, viewer: Reviewer) {
  const mayHandle = !!row.tool && canRun(viewer.role, row.tool) && (row.requestedById === viewer.userId || can(viewer.role, 'agent_action', 'approve'));
  const action = row.tool ? getAction(row.tool) : null;
  const args = row.tool && row.args ? (action!.input.safeParse(row.args).data ?? null) : null;
  const open = row.status === 'PROPOSED' || row.status === 'FAILED';
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    agent: row.agent,
    title: row.title ?? row.type.replaceAll('_', ' ').toLowerCase(),
    reasoning: row.reasoning,
    evidence: (row.evidence as Evidence) ?? [],
    confidence: row.confidence,
    error: row.error,
    tool: row.tool,
    actionLabel: action?.label ?? null,
    link:
      action && args
        ? action.link?.(args, row.result ?? undefined) ?? null
        : row.requisitionId
          ? `requisitions/${row.requisitionId}`
          : row.invoiceId
            ? `invoices/${row.invoiceId}`
            : null,
    editable: open && action?.editable && args ? action.editable(args) : [],
    canApprove: open && mayHandle,
    canUndo: row.status === 'EXECUTED' && !!action?.revert && !!row.result && mayHandle,
    appliedBy: row.appliedAt ? (row.appliedById ? names.get(row.appliedById) ?? 'Someone' : 'Agent') : null,
    revertedBy: row.revertedById ? names.get(row.revertedById) ?? 'Someone' : null,
    appliedAt: row.appliedAt,
    revertedAt: row.revertedAt,
    createdAt: row.createdAt,
  };
}

/**
 * The inbox: what needs someone, what agents did recently, and findings not
 * yet read. The viewer's role decides which buttons they get.
 */
export async function getAgentInbox(teamId: string, viewer: Reviewer) {
  await closeHandledElsewhere(teamId);
  const since = new Date(Date.now() - DONE_DAYS * 86_400_000);
  const [needsYou, done, findings] = await Promise.all([
    prisma.agentAction.findMany({
      where: { teamId, tool: { not: null }, status: { in: ['PROPOSED', 'FAILED'] }, reviewedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.agentAction.findMany({
      where: { teamId, tool: { not: null }, status: { in: ['EXECUTED', 'REVERTED'] }, appliedAt: { gte: since } },
      orderBy: { appliedAt: 'desc' },
      take: 100,
    }),
    prisma.agentAction.findMany({
      where: { teamId, tool: null, reviewedAt: null, status: { not: 'OVERRIDDEN_BY_HUMAN' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const userIds = [...new Set([...done, ...needsYou].flatMap((row) => [row.appliedById, row.revertedById]).filter((v): v is string => !!v))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  const map = (rows: AgentAction[]) => rows.map((row) => toEntry(row, names, viewer));
  const doneEntries = map(done);
  return {
    needsYou: map(needsYou),
    done: doneEntries,
    findings: map(findings),
    counts: {
      needsYou: needsYou.length,
      doneByAgents: doneEntries.filter((entry) => entry.appliedBy === 'Agent' && entry.status === 'EXECUTED').length,
      findings: findings.length,
    },
    doneDays: DONE_DAYS,
  };
}

export const getAgentPolicy = async (teamId: string) => {
  return prisma.agentPolicy.upsert({
    where: { teamId },
    create: { teamId },
    update: {},
  });
};

export const updateAgentPolicy = async (teamId: string, data: Record<string, unknown>) => {
  return prisma.agentPolicy.upsert({
    where: { teamId },
    create: { teamId, ...data },
    update: data,
  });
};
