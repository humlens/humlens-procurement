import { ApprovalStepStatus, RequisitionStatus, type Role } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { afterRequisitionChange } from '@/lib/operations';
import { createRequisition, decideRequisitionStep } from 'models/requisition';
import { defineAction } from './types';

const money = (currency: string, amount: unknown) => `${currency} ${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

async function findRequisition(teamId: string, requisitionId: string) {
  const requisition = await prisma.purchaseRequisition.findFirst({
    where: { id: requisitionId, teamId },
    include: { approvalSteps: { orderBy: { stepOrder: 'asc' } } },
  });
  if (!requisition) throw new ApiError(404, 'That requisition is not in this team.');
  return requisition;
}

// ---------------------------------------------------------------------------
// Approve the current approval step of a requisition.

const approveInput = z.object({ requisitionId: z.string().min(1), stepId: z.string().min(1) });
type ApproveInput = z.infer<typeof approveInput>;

export const approveRequisitionStep = defineAction<ApproveInput, { stepId: string }>({
  name: 'requisition.approveStep',
  label: 'Approve a requisition step',
  resource: 'requisition',
  permission: 'approve',
  input: approveInput,
  async describe(teamId, params) {
    const requisition = await findRequisition(teamId, params.requisitionId);
    const step = requisition.approvalSteps.find((s) => s.id === params.stepId);
    return `Approve “${requisition.title}” (${money(requisition.currency, requisition.totalAmount)})${step ? ` at the ${step.requiredRole.toLowerCase().replaceAll('_', ' ')} step` : ''}`;
  },
  async apply(ctx, params) {
    const requisition = await findRequisition(ctx.teamId, params.requisitionId);
    const pending = requisition.approvalSteps.find((s) => s.status === ApprovalStepStatus.PENDING);
    if (!pending || pending.id !== params.stepId) throw new ApiError(409, 'This approval step has already been decided.');
    // A person approves in their own role (the step checks it); the agent
    // approves as the step requires, marked as autonomous.
    await decideRequisitionStep({
      teamId: ctx.teamId,
      requisitionId: params.requisitionId,
      actorId: ctx.source === 'agent' ? null : ctx.userId,
      actorRole: (ctx.source === 'agent' ? pending.requiredRole : ctx.role ?? pending.requiredRole) as Role,
      decision: 'APPROVED',
      comment: ctx.source === 'agent' ? 'Auto-approved by the procurement agent within policy limits.' : 'Approved from the agent inbox.',
      actedByAgent: ctx.source === 'agent',
    });
    return { stepId: params.stepId };
  },
  // Puts the step back to pending, but only while nothing has built on the
  // approval: no later step decided and no purchase order raised.
  async revert(ctx, result, params) {
    const requisition = await findRequisition(ctx.teamId, params.requisitionId);
    const step = requisition.approvalSteps.find((s) => s.id === result.stepId);
    if (!step || (step.status !== ApprovalStepStatus.APPROVED && step.status !== ApprovalStepStatus.AUTO_APPROVED)) {
      throw new ApiError(409, 'That approval has already changed, so it was not undone.');
    }
    const openStatuses: RequisitionStatus[] = [RequisitionStatus.IN_APPROVAL, RequisitionStatus.APPROVED];
    if (!openStatuses.includes(requisition.status)) {
      const now = requisition.status === RequisitionStatus.CONVERTED_TO_PO ? 'on a purchase order' : requisition.status.toLowerCase().replaceAll('_', ' ');
      throw new ApiError(409, `“${requisition.title}” is now ${now}, so the approval can't be undone.`);
    }
    if (requisition.approvalSteps.some((s) => s.stepOrder > step.stepOrder && s.status !== ApprovalStepStatus.PENDING)) {
      throw new ApiError(409, 'A later approval step has been decided since, so this one was not undone.');
    }
    await prisma.$transaction([
      prisma.requisitionApprovalStep.update({
        where: { id: step.id },
        data: { status: ApprovalStepStatus.PENDING, approverId: null, decidedAt: null, comment: null },
      }),
      prisma.approvalAction.create({
        data: { stepId: step.id, actorId: ctx.userId, actedByAgent: false, decision: ApprovalStepStatus.PENDING, comment: 'Approval undone from the agent inbox.' },
      }),
      prisma.purchaseRequisition.update({
        where: { id: requisition.id },
        data: { status: RequisitionStatus.IN_APPROVAL, decidedAt: null },
      }),
    ]);
    void afterRequisitionChange(ctx.teamId, requisition.id);
  },
  async stillNeeded(teamId, params) {
    const requisition = await prisma.purchaseRequisition.findFirst({
      where: { id: params.requisitionId, teamId },
      select: { status: true, approvalSteps: { where: { status: ApprovalStepStatus.PENDING }, orderBy: { stepOrder: 'asc' }, take: 1, select: { id: true } } },
    });
    return requisition?.status === RequisitionStatus.IN_APPROVAL && requisition.approvalSteps[0]?.id === params.stepId;
  },
  link: (params) => `requisitions/${params.requisitionId}`,
});

// ---------------------------------------------------------------------------
// Create a draft requisition (e.g. from a plain-English request).

const draftInput = z.object({
  title: z.string().min(1).max(200),
  justification: z.string().max(2000).optional(),
  currency: z.string().min(3).max(3).default('USD'),
  departmentId: z.string().optional(),
  budgetId: z.string().optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        quantity: z.number().positive(),
        unit: z.string().max(40).optional(),
        estimatedPrice: z.number().nonnegative(),
      })
    )
    .min(1),
});
type DraftInput = z.infer<typeof draftInput>;

const draftTotal = (params: DraftInput) => params.lineItems.reduce((sum, line) => sum + line.quantity * line.estimatedPrice, 0);

export const createDraftRequisition = defineAction<DraftInput, { requisitionId: string }>({
  name: 'requisition.createDraft',
  label: 'Draft a requisition',
  resource: 'requisition',
  permission: 'create',
  input: draftInput,
  async describe(_teamId, params) {
    return `Draft requisition “${params.title}” (${money(params.currency, draftTotal(params))})`;
  },
  async apply(ctx, params) {
    const requisition = await createRequisition({ teamId: ctx.teamId, requesterId: ctx.userId, ...params });
    return { requisitionId: requisition.id };
  },
  // Only a draft can be taken back; once submitted it follows its approvals.
  async revert(ctx, result) {
    const requisition = await prisma.purchaseRequisition.findFirst({ where: { id: result.requisitionId, teamId: ctx.teamId }, select: { status: true, title: true } });
    if (!requisition) throw new ApiError(404, 'That requisition no longer exists.');
    if (requisition.status !== RequisitionStatus.DRAFT) {
      throw new ApiError(409, `“${requisition.title}” has been submitted, so it can't be undone here.`);
    }
    await prisma.purchaseRequisition.update({ where: { id: result.requisitionId }, data: { status: RequisitionStatus.CANCELLED } });
  },
  editable: (params) =>
    params.lineItems.map((line, index) => ({
      key: `line${index}`,
      label: params.lineItems.length === 1 ? 'Quantity' : `Quantity: ${line.description}`,
      value: line.quantity,
      min: 1,
    })),
  withEdits: (params, values) => ({
    ...params,
    lineItems: params.lineItems.map((line, index) => ({ ...line, quantity: values[`line${index}`] ?? line.quantity })),
  }),
  link: (_params, result) => (result ? `requisitions/${result.requisitionId}` : 'requisitions'),
});
