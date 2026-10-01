import { prisma } from '@/lib/prisma';
import { VendorReturnStatus } from '@prisma/client';

import { ApiError } from '@/lib/errors';
import { isGoodCondition } from '@/lib/receiving';

// Returns to vendor (RTV): goods that arrived damaged or wrong going back for
// a credit note or a replacement. DRAFT → SENT → CREDITED, or CANCELLED.
// Nothing here contacts the vendor; "sent" records that a person did.

export const listVendorReturns = async (teamId: string, params?: { status?: VendorReturnStatus; poId?: string; receiptId?: string }) => {
  return prisma.vendorReturn.findMany({
    where: { teamId, status: params?.status, poId: params?.poId, receiptId: params?.receiptId },
    include: {
      vendor: { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, poNumber: true } },
      lineItems: true,
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const getVendorReturn = async (teamId: string, id: string) => {
  return prisma.vendorReturn.findFirstOrThrow({
    where: { id, teamId },
    include: {
      vendor: { select: { id: true, name: true, email: true } },
      purchaseOrder: { select: { id: true, poNumber: true } },
      receipt: { select: { id: true, receivedAt: true } },
      lineItems: { include: { poLineItem: { select: { description: true, sku: true, unit: true } } } },
    },
  });
};

const nextReturnNumber = async (teamId: string) => {
  const count = await prisma.vendorReturn.count({ where: { teamId } });
  return `RTV-${String(count + 1).padStart(5, '0')}`;
};

// What the vendor should credit for a return: the returned units at the PO price.
export const expectedCredit = (lines: { quantity: unknown; unitPrice: unknown }[]) =>
  Math.round(lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0) * 100) / 100;

// Drafts a return for a goods receipt's not-good lines (or the lines given).
// Priced at the PO line's unit price. One open return per receipt: a second
// call for the same receipt returns the existing draft instead of another.
export const createVendorReturnDraft = async (params: {
  teamId: string;
  receiptId: string;
  reason?: string;
  lineItems?: { poLineItemId: string; quantity: number; condition?: string }[];
}) => {
  const receipt = await prisma.goodsReceipt.findFirst({
    where: { id: params.receiptId, teamId: params.teamId },
    include: {
      purchaseOrder: { select: { id: true, vendorId: true, currency: true } },
      lineItems: { include: { poLineItem: { select: { id: true, unitPrice: true } } } },
    },
  });
  if (!receipt) throw new ApiError(404, 'That goods receipt is not in this team.');

  const existing = await prisma.vendorReturn.findFirst({
    where: { teamId: params.teamId, receiptId: receipt.id, status: { not: VendorReturnStatus.CANCELLED } },
  });
  if (existing) return existing;

  const lines =
    params.lineItems ??
    receipt.lineItems
      .filter((line) => !isGoodCondition(line.condition) && Number(line.quantityReceived) > 0)
      .map((line) => ({ poLineItemId: line.poLineItemId, quantity: Number(line.quantityReceived), condition: line.condition ?? undefined }));
  if (!lines.length) throw new ApiError(400, 'Nothing on this receipt arrived damaged or wrong, so there is nothing to return.');

  const priceOf = new Map(receipt.lineItems.map((line) => [line.poLineItemId, line.poLineItem.unitPrice]));
  for (const line of lines) {
    if (!priceOf.has(line.poLineItemId)) throw new ApiError(400, 'A returned line is not on this receipt.');
  }

  return prisma.vendorReturn.create({
    data: {
      teamId: params.teamId,
      returnNumber: await nextReturnNumber(params.teamId),
      vendorId: receipt.purchaseOrder.vendorId,
      poId: receipt.purchaseOrder.id,
      receiptId: receipt.id,
      currency: receipt.purchaseOrder.currency,
      reason: params.reason,
      lineItems: {
        create: lines.map((line) => ({
          poLineItemId: line.poLineItemId,
          quantity: line.quantity,
          unitPrice: priceOf.get(line.poLineItemId)!,
          condition: line.condition,
        })),
      },
    },
    include: { lineItems: true },
  });
};

// Moves a return on. Each step only from the states that make sense, so two
// people clicking at once can't, say, credit a cancelled return.
const move = async (teamId: string, id: string, from: VendorReturnStatus[], data: Record<string, unknown>, verb: string) => {
  const current = await prisma.vendorReturn.findFirst({ where: { id, teamId }, select: { status: true, returnNumber: true } });
  if (!current) throw new ApiError(404, 'Vendor return not found.');
  const updated = await prisma.vendorReturn.updateMany({ where: { id, teamId, status: { in: from } }, data });
  if (updated.count === 0) {
    throw new ApiError(409, `${current.returnNumber} is ${current.status.toLowerCase()}, so it can't be ${verb}.`);
  }
  return getVendorReturn(teamId, id);
};

export const markVendorReturnSent = (teamId: string, id: string) =>
  move(teamId, id, [VendorReturnStatus.DRAFT], { status: VendorReturnStatus.SENT, sentAt: new Date() }, 'marked sent');

// The vendor's credit note closes the return. It can be recorded straight
// from a draft too, for a vendor who credits before the goods are collected.
export const recordVendorReturnCredit = (teamId: string, id: string, credit: { amount: number; reference?: string }) =>
  move(
    teamId,
    id,
    [VendorReturnStatus.DRAFT, VendorReturnStatus.SENT],
    { status: VendorReturnStatus.CREDITED, creditAmount: credit.amount, creditReference: credit.reference || null, creditedAt: new Date() },
    'credited'
  );

export const cancelVendorReturn = (teamId: string, id: string) =>
  move(teamId, id, [VendorReturnStatus.DRAFT, VendorReturnStatus.SENT], { status: VendorReturnStatus.CANCELLED, cancelledAt: new Date() }, 'cancelled');
