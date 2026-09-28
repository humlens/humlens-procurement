import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { createRequisition, submitRequisition } from 'models/requisition';

// What /api/v1 offers to connected systems such as a Humlens Commerce store:
// raise purchase requests for SKUs running low, follow them, and read goods
// received so stock can be topped up.

export const getTeamSummary = async (teamId: string) => {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
  const departments = await prisma.department.findMany({ where: { teamId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  return { name: team.name, slug: team.slug, currency: team.currency, departments };
};

const requisitionView = {
  id: true,
  title: true,
  status: true,
  externalReference: true,
  totalAmount: true,
  currency: true,
  createdAt: true,
  lineItems: { select: { sku: true, description: true, quantity: true, unit: true } },
  purchaseOrder: { select: { poNumber: true, status: true } },
} satisfies Prisma.PurchaseRequisitionSelect;

// Creates a requisition (and submits it for approval when asked). A second
// call with the same externalReference returns the first one instead.
export const raiseRequisition = async (params: {
  teamId: string;
  actorId: string;
  title: string;
  justification?: string;
  departmentId?: string;
  neededBy?: Date;
  externalReference: string;
  submit: boolean;
  lines: { sku: string; description: string; quantity: number; unit?: string; estimatedPrice: number }[];
}) => {
  const existing = await prisma.purchaseRequisition.findUnique({
    where: { teamId_externalReference: { teamId: params.teamId, externalReference: params.externalReference } },
    select: requisitionView,
  });
  if (existing) return { created: false, requisition: existing };

  if (params.departmentId && !(await prisma.department.findFirst({ where: { id: params.departmentId, teamId: params.teamId } }))) {
    throw new ApiError(404, 'Department not found.');
  }

  const team = await prisma.team.findUniqueOrThrow({ where: { id: params.teamId } });
  const requisition = await createRequisition({
    teamId: params.teamId,
    requesterId: params.actorId,
    title: params.title,
    justification: params.justification,
    departmentId: params.departmentId,
    neededBy: params.neededBy,
    externalReference: params.externalReference,
    currency: team.currency,
    lineItems: params.lines,
  });
  if (params.submit) await submitRequisition(params.teamId, requisition.id);

  return {
    created: true,
    requisition: await prisma.purchaseRequisition.findUniqueOrThrow({ where: { id: requisition.id }, select: requisitionView }),
  };
};

export const listRequisitionsForSync = async (teamId: string, params: { ids?: string[]; references?: string[] }) => {
  if (!params.ids?.length && !params.references?.length) throw new ApiError(400, 'Pass ids or references.');
  return prisma.purchaseRequisition.findMany({
    where: {
      teamId,
      OR: [
        ...(params.ids?.length ? [{ id: { in: params.ids } }] : []),
        ...(params.references?.length ? [{ externalReference: { in: params.references } }] : []),
      ],
    },
    select: requisitionView,
  });
};

// Goods received on or after `since`, oldest first, with each line's SKU
// (when the PO line has one). Callers should de-duplicate by receipt id.
export const listReceiptsForSync = async (teamId: string, params: { since?: Date; limit: number }) => {
  const receipts = await prisma.goodsReceipt.findMany({
    where: { teamId, status: { not: 'REJECTED' }, ...(params.since ? { receivedAt: { gte: params.since } } : {}) },
    orderBy: { receivedAt: 'asc' },
    take: params.limit,
    select: {
      id: true,
      status: true,
      receivedAt: true,
      notes: true,
      purchaseOrder: { select: { poNumber: true, requisition: { select: { externalReference: true } } } },
      lineItems: {
        select: { quantityReceived: true, condition: true, poLineItem: { select: { sku: true, description: true, unit: true } } },
      },
    },
  });

  return receipts.map((receipt) => ({
    id: receipt.id,
    status: receipt.status,
    receivedAt: receipt.receivedAt.toISOString(),
    notes: receipt.notes,
    poNumber: receipt.purchaseOrder.poNumber,
    requisitionReference: receipt.purchaseOrder.requisition?.externalReference ?? null,
    lines: receipt.lineItems.map((line) => ({
      sku: line.poLineItem.sku,
      description: line.poLineItem.description,
      unit: line.poLineItem.unit,
      quantity: Number(line.quantityReceived),
      condition: line.condition,
    })),
  }));
};
