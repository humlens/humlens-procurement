import { prisma } from '@/lib/prisma';
import { Role, RequisitionStatus, ApprovalStepStatus } from '@prisma/client';

import { ApiError } from '@/lib/errors';
import { resolveApprovalWorkflow } from './approvalWorkflow';
import { applyBudgetTransaction } from './budget';
import { afterRequisitionChange } from '@/lib/operations';

export const listRequisitions = async (
  teamId: string,
  params?: { status?: RequisitionStatus; requesterId?: string }
) => {
  return prisma.purchaseRequisition.findMany({
    where: { teamId, status: params?.status, requesterId: params?.requesterId },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      department: true,
      lineItems: true,
      _count: { select: { lineItems: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const getRequisition = async (teamId: string, id: string) => {
  return prisma.purchaseRequisition.findFirstOrThrow({
    where: { id, teamId },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      department: true,
      budget: true,
      lineItems: { include: { category: true } },
      approvalSteps: {
        orderBy: { stepOrder: 'asc' },
        include: {
          approver: { select: { id: true, name: true, email: true } },
          actions: { orderBy: { createdAt: 'desc' } },
        },
      },
      purchaseOrder: true,
      agentActions: { orderBy: { createdAt: 'desc' } },
    },
  });
};

// "Pending my approval" queue: requisitions whose lowest-numbered PENDING
// step requires a role this user holds on the team.
export const listPendingApprovalsForRole = async (teamId: string, role: Role) => {
  const requisitions = await prisma.purchaseRequisition.findMany({
    where: { teamId, status: { in: [RequisitionStatus.SUBMITTED, RequisitionStatus.IN_APPROVAL] } },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      approvalSteps: { orderBy: { stepOrder: 'asc' } },
    },
    orderBy: { submittedAt: 'asc' },
  });

  return requisitions.filter((r) => {
    const nextStep = r.approvalSteps.find((s) => s.status === ApprovalStepStatus.PENDING);
    return nextStep?.requiredRole === role || role === Role.OWNER;
  });
};

export const createRequisition = async (params: {
  teamId: string;
  requesterId: string;
  title: string;
  justification?: string;
  departmentId?: string;
  budgetId?: string;
  neededBy?: Date;
  currency: string;
  externalReference?: string;
  lineItems: {
    sku?: string;
    description: string;
    quantity: number;
    unit?: string;
    estimatedPrice: number;
    categoryId?: string;
    suggestedVendorId?: string;
  }[];
}) => {
  const totalAmount = params.lineItems.reduce(
    (sum, li) => sum + li.quantity * li.estimatedPrice,
    0
  );

  return prisma.purchaseRequisition.create({
    data: {
      teamId: params.teamId,
      requesterId: params.requesterId,
      title: params.title,
      justification: params.justification,
      departmentId: params.departmentId,
      budgetId: params.budgetId,
      neededBy: params.neededBy,
      externalReference: params.externalReference,
      currency: params.currency,
      totalAmount,
      status: RequisitionStatus.DRAFT,
      lineItems: { create: params.lineItems },
    },
    include: { lineItems: true },
  });
};

// Moves a DRAFT requisition to SUBMITTED, builds its approval step sequence
// from the team's ApprovalWorkflow policy for this amount band, and commits
// the total against its budget (if any) so the budget's "available" figure
// reflects money that's spoken for even before a PO exists.
export const submitRequisition = async (teamId: string, id: string) => {
  const requisition = await prisma.purchaseRequisition.findFirstOrThrow({
    where: { id, teamId },
    include: { lineItems: true },
  });

  if (requisition.status !== RequisitionStatus.DRAFT) {
    throw new ApiError(400, 'Only draft requisitions can be submitted.');
  }

  const workflow = await resolveApprovalWorkflow(teamId, Number(requisition.totalAmount));
  const roles = workflow.approverRoles.length ? workflow.approverRoles : [Role.ADMIN];

  if (requisition.budgetId) {
    await applyBudgetTransaction({
      budgetId: requisition.budgetId,
      type: 'COMMIT',
      amount: Number(requisition.totalAmount),
      reference: requisition.id,
      note: `Requisition ${requisition.title}`,
    });
  }

  const submitted = await prisma.purchaseRequisition.update({
    where: { id },
    data: {
      status: roles.length ? RequisitionStatus.IN_APPROVAL : RequisitionStatus.APPROVED,
      submittedAt: new Date(),
      approvalSteps: {
        create: roles.map((requiredRole, index) => ({
          stepOrder: index,
          requiredRole,
        })),
      },
    },
    include: { approvalSteps: true },
  });
  void afterRequisitionChange(teamId, id);
  return submitted;
};

// Approves or rejects the requisition's current (lowest PENDING) step on
// behalf of `actorId`. `actedByAgent` marks the action as autonomous for
// audit purposes — see lib/ai/agents/approvalAgent.ts.
export const decideRequisitionStep = async (params: {
  teamId: string;
  requisitionId: string;
  actorId: string | null;
  actorRole: Role;
  decision: 'APPROVED' | 'REJECTED';
  comment?: string;
  actedByAgent?: boolean;
}) => {
  const { teamId, requisitionId, actorId, actorRole, decision, comment, actedByAgent } = params;

  const requisition = await prisma.purchaseRequisition.findFirstOrThrow({
    where: { id: requisitionId, teamId },
    include: { approvalSteps: { orderBy: { stepOrder: 'asc' } } },
  });

  const step = requisition.approvalSteps.find((s) => s.status === ApprovalStepStatus.PENDING);

  if (!step) {
    throw new ApiError(400, 'This requisition has no pending approval step.');
  }

  if (step.requiredRole !== actorRole && actorRole !== Role.OWNER) {
    throw new ApiError(403, `This step requires ${step.requiredRole} approval.`);
  }

  const decided = await prisma.$transaction(async (tx) => {
    await tx.requisitionApprovalStep.update({
      where: { id: step.id },
      data: {
        status: decision as ApprovalStepStatus,
        approverId: actorId ?? undefined,
        decidedAt: new Date(),
        comment,
      },
    });

    await tx.approvalAction.create({
      data: {
        stepId: step.id,
        actorId,
        actedByAgent: !!actedByAgent,
        decision: decision as ApprovalStepStatus,
        comment,
      },
    });

    if (decision === 'REJECTED') {
      if (requisition.budgetId) {
        await applyBudgetTransaction({
          budgetId: requisition.budgetId,
          type: 'RELEASE',
          amount: Number(requisition.totalAmount),
          reference: requisition.id,
          note: 'Requisition rejected',
        });
      }
      return tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: { status: RequisitionStatus.REJECTED, decidedAt: new Date() },
      });
    }

    const remainingSteps = requisition.approvalSteps.filter(
      (s) => s.id !== step.id && s.status === ApprovalStepStatus.PENDING
    );

    if (remainingSteps.length === 0) {
      return tx.purchaseRequisition.update({
        where: { id: requisitionId },
        data: { status: RequisitionStatus.APPROVED, decidedAt: new Date() },
      });
    }

    return tx.purchaseRequisition.findUniqueOrThrow({ where: { id: requisitionId } });
  });
  void afterRequisitionChange(teamId, requisitionId);
  return decided;
};
