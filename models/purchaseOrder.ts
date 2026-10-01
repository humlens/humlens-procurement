import { prisma } from '@/lib/prisma';
import { POStatus, RequisitionStatus } from '@prisma/client';

import { ApiError } from '@/lib/errors';
import { applyBudgetTransaction } from './budget';
import { afterPurchaseOrderChange, afterPurchaseOrderIssued } from '@/lib/operations';

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
      vendorReturns: { select: { id: true, returnNumber: true, status: true, receiptId: true }, orderBy: { createdAt: 'desc' } },
    },
  });
};

const nextPoNumber = async (teamId: string) => {
  const count = await prisma.purchaseOrder.count({ where: { teamId } });
  return `PO-${String(count + 1).padStart(5, '0')}`;
};

// Requisition lines raised by a connected store carry a SKU. The PO form copies
// the lines but lets people edit them, so match by description first and fall
// back to position when the line count is unchanged.
const carrySkus = <T extends { sku?: string; description: string }>(
  lines: T[],
  requisitionLines: { sku: string | null; description: string }[]
): T[] => {
  const normalise = (text: string) => text.trim().toLowerCase();
  return lines.map((line, index) => {
    if (line.sku) return line;
    const match =
      requisitionLines.find((candidate) => candidate.sku && normalise(candidate.description) === normalise(line.description)) ??
      (lines.length === requisitionLines.length ? requisitionLines[index] : undefined);
    return match?.sku ? { ...line, sku: match.sku } : line;
  });
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
  expectedDeliveryDate?: Date;
  tax: number;
  shipping: number;
  lineItems: { sku?: string; description: string; quantity: number; unit?: string; unitPrice: number }[];
}) => {
  // The vendor must be this team's, and not blocked.
  const vendor = await prisma.vendor.findFirst({ where: { id: params.vendorId, teamId: params.teamId }, select: { status: true } });
  if (!vendor) throw new ApiError(400, 'Vendor not found.');
  if (vendor.status === 'BLOCKED') throw new ApiError(400, 'This vendor is blocked. Choose another vendor.');

  const subtotal = params.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const totalAmount = subtotal + params.tax + params.shipping;
  const poNumber = await nextPoNumber(params.teamId);

  let lineItems = params.lineItems;
  if (params.requisitionId) {
    const requisition = await prisma.purchaseRequisition.findFirstOrThrow({
      where: { id: params.requisitionId, teamId: params.teamId },
      include: { lineItems: true },
    });
    if (requisition.status !== RequisitionStatus.APPROVED) {
      throw new ApiError(400, 'The linked requisition must be approved before creating a PO.');
    }
    lineItems = carrySkus(lineItems, requisition.lineItems);
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
      expectedDeliveryDate: params.expectedDeliveryDate,
      lineItems: { create: lineItems },
    },
    include: { lineItems: true },
  });

  if (params.requisitionId) {
    await prisma.purchaseRequisition.update({
      where: { id: params.requisitionId },
      data: { status: RequisitionStatus.CONVERTED_TO_PO },
    });
    void afterPurchaseOrderChange(params.teamId, po.id);
  }

  return po;
};

// The promised delivery date is the one thing people change after creating a
// PO (the vendor confirms or moves it). Cleared with null. Not sent on to the
// supplier or the accounting system again once the PO has gone out.
export const setPurchaseOrderDeliveryDate = async (teamId: string, id: string, expectedDeliveryDate: Date | null) => {
  const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { id, teamId } });
  const closedStatuses: POStatus[] = [POStatus.CLOSED, POStatus.CANCELLED];
  if (closedStatuses.includes(po.status)) {
    throw new ApiError(400, 'This purchase order is closed, so its delivery date can no longer change.');
  }
  return prisma.purchaseOrder.update({ where: { id }, data: { expectedDeliveryDate } });
};

export const approvePurchaseOrder = async (teamId: string, id: string, approvedById: string) => {
  const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { id, teamId } });

  if (po.status !== POStatus.DRAFT && po.status !== POStatus.PENDING_APPROVAL) {
    throw new ApiError(400, 'Only draft or pending purchase orders can be approved.');
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: POStatus.APPROVED, approvedById, approvedAt: new Date() },
  });
  void afterPurchaseOrderChange(teamId, id);
  return updated;
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

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: POStatus.ISSUED, issuedAt: new Date() },
  });
  void afterPurchaseOrderChange(teamId, id);
  void afterPurchaseOrderIssued(teamId, id);
  return updated;
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

  const updated = await prisma.purchaseOrder.update({ where: { id }, data: { status: POStatus.CANCELLED } });
  void afterPurchaseOrderChange(teamId, id);
  return updated;
};
