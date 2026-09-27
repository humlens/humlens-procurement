import { prisma } from '@/lib/prisma';
import { POStatus, RequisitionStatus } from '@prisma/client';

import { ApiError } from '@/lib/errors';
import { applyBudgetTransaction } from './budget';

export const listPurchaseOrders = async (teamId: string, params?: { status?: POStatus }) => {
  return prisma.purchaseOrder.findMany({
    where: { teamId, status: params?.status },
    include: { vendor: true, _count: { select: { lineItems: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const getPurchaseOrder = async (teamId: string, id: string) => {
  return prisma.purchaseOrder.findFirstOrThrow({
    where: { id, teamId },
    include: {
      vendor: true,
      requisition: true,
      contract: true,
      budget: true,
      createdBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      lineItems: true,
      goodsReceipts: { include: { lineItems: true }, orderBy: { receivedAt: 'desc' } },
      invoices: true,
    },
  });
};

const nextPoNumber = async (teamId: string) => {
  const count = await prisma.purchaseOrder.count({ where: { teamId } });
  return `PO-${String(count + 1).padStart(5, '0')}`;
};

export const createPurchaseOrder = async (params: {
  teamId: string;
  createdById: string;
  vendorId: string;
  requisitionId?: string;
  contractId?: string;
  budgetId?: string;
  currency: string;
  shippingAddress?: string;
  billingAddress?: string;
  notes?: string;
  tax: number;
  shipping: number;
  lineItems: { description: string; quantity: number; unit?: string; unitPrice: number }[];
}) => {
  const subtotal = params.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const totalAmount = subtotal + params.tax + params.shipping;
  const poNumber = await nextPoNumber(params.teamId);

  if (params.requisitionId) {
    const requisition = await prisma.purchaseRequisition.findFirstOrThrow({
      where: { id: params.requisitionId, teamId: params.teamId },
    });
    if (requisition.status !== RequisitionStatus.APPROVED) {
      throw new ApiError(400, 'The linked requisition must be approved before creating a PO.');
    }
  }

  const po = await prisma.purchaseOrder.create({
    data: {
      teamId: params.teamId,
      poNumber,
      createdById: params.createdById,
      vendorId: params.vendorId,
      requisitionId: params.requisitionId,
      contractId: params.contractId,
      budgetId: params.budgetId,
      currency: params.currency,
      subtotal,
      tax: params.tax,
      shipping: params.shipping,
      totalAmount,
      shippingAddress: params.shippingAddress,
      billingAddress: params.billingAddress,
      notes: params.notes,
      lineItems: { create: params.lineItems },
    },
    include: { lineItems: true },
  });

  if (params.requisitionId) {
    await prisma.purchaseRequisition.update({
      where: { id: params.requisitionId },
      data: { status: RequisitionStatus.CONVERTED_TO_PO },
    });
  }

  return po;
};

export const approvePurchaseOrder = async (teamId: string, id: string, approvedById: string) => {
  const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { id, teamId } });

  if (po.status !== POStatus.DRAFT && po.status !== POStatus.PENDING_APPROVAL) {
    throw new ApiError(400, 'Only draft or pending purchase orders can be approved.');
  }

  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: POStatus.APPROVED, approvedById, approvedAt: new Date() },
  });
};

export const issuePurchaseOrder = async (teamId: string, id: string) => {
  const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { id, teamId } });

  if (po.status !== POStatus.APPROVED) {
    throw new ApiError(400, 'Only approved purchase orders can be issued.');
  }

  if (po.budgetId) {
    await applyBudgetTransaction({
      budgetId: po.budgetId,
      type: 'COMMIT',
      amount: Number(po.totalAmount),
      reference: po.id,
      note: `PO ${po.poNumber} issued`,
    });
  }

  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: POStatus.ISSUED, issuedAt: new Date() },
  });
};

export const cancelPurchaseOrder = async (teamId: string, id: string) => {
  const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { id, teamId } });

  const closedStatuses: POStatus[] = [POStatus.CLOSED, POStatus.CANCELLED];
  if (closedStatuses.includes(po.status)) {
    throw new ApiError(400, 'This purchase order is already closed.');
  }

  if (po.budgetId && po.status === POStatus.ISSUED) {
    await applyBudgetTransaction({
      budgetId: po.budgetId,
      type: 'RELEASE',
      amount: Number(po.totalAmount),
      reference: po.id,
      note: `PO ${po.poNumber} cancelled`,
    });
  }

  return prisma.purchaseOrder.update({ where: { id }, data: { status: POStatus.CANCELLED } });
};
