import { prisma } from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';
import { afterInvoiceApproved } from '@/lib/operations';
import { isGoodCondition } from '@/lib/receiving';

export const listInvoices = async (teamId: string, params?: { status?: InvoiceStatus }) => {
  return prisma.invoice.findMany({
    where: { teamId, status: params?.status },
    include: { vendor: true, purchaseOrder: { select: { id: true, poNumber: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const getInvoice = async (teamId: string, id: string) => {
  return prisma.invoice.findFirstOrThrow({
    where: { id, teamId },
    include: {
      vendor: true,
      purchaseOrder: { include: { lineItems: true, goodsReceipts: { include: { lineItems: true } } } },
      lineItems: { include: { poLineItem: true } },
      payments: true,
      agentActions: { orderBy: { createdAt: 'desc' } },
    },
  });
};

export const createInvoice = async (params: {
  teamId: string;
  vendorId: string;
  poId?: string;
  invoiceNumber: string;
  currency: string;
  tax: number;
  dueDate?: Date;
  issuedDate?: Date;
  documentUrl?: string;
  lineItems: { description: string; quantity: number; unitPrice: number; poLineItemId?: string }[];
}) => {
  const subtotal = params.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const totalAmount = subtotal + params.tax;

  return prisma.invoice.create({
    data: {
      teamId: params.teamId,
      vendorId: params.vendorId,
      poId: params.poId,
      invoiceNumber: params.invoiceNumber,
      currency: params.currency,
      subtotal,
      tax: params.tax,
      totalAmount,
      dueDate: params.dueDate,
      issuedDate: params.issuedDate,
      documentUrl: params.documentUrl,
      lineItems: {
        create: params.lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          amount: li.quantity * li.unitPrice,
          poLineItemId: li.poLineItemId,
        })),
      },
    },
    include: { lineItems: true },
  });
};

export type MatchMismatch = {
  invoiceLineId: string;
  reason: 'no_po_line' | 'price_variance' | 'over_quantity' | 'not_received' | 'damaged';
  detail: string;
};

// Core 3-way match: PO (what was ordered/priced) x GoodsReceipt (what
// physically arrived) x Invoice (what the vendor is billing). Shared by the
// manual "Review match" API route and the autonomous matching agent so both
// paths apply identical rules — see lib/ai/agents/invoiceMatchAgent.ts.
//
// Only units received in good condition count as delivered (see
// lib/receiving.ts). Billing for units that arrived damaged or wrong is a
// mismatch that names the credit due; a replacement received in good
// condition later counts, so it clears once the replacement is booked in.
// `notes` are for the reviewer and don't fail the match: damaged units that
// aren't billed, and any returns to vendor on the order.
export const runThreeWayMatch = async (
  teamId: string,
  invoiceId: string,
  tolerancePct = 2
) => {
  const invoice = await prisma.invoice.findFirstOrThrow({
    where: { id: invoiceId, teamId },
    include: {
      lineItems: true,
      purchaseOrder: {
        include: {
          lineItems: true,
          goodsReceipts: { include: { lineItems: true } },
          vendorReturns: { where: { status: { not: 'CANCELLED' } }, include: { lineItems: true }, orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });

  const mismatches: MatchMismatch[] = [];
  const notes: string[] = [];

  if (!invoice.purchaseOrder) {
    return { matched: false, mismatches: [{ invoiceLineId: '', reason: 'no_po_line', detail: 'Invoice is not linked to a purchase order.' }] as MatchMismatch[], notes };
  }

  const receivedByPoLine = new Map<string, number>();
  const goodByPoLine = new Map<string, number>();
  for (const receipt of invoice.purchaseOrder.goodsReceipts) {
    for (const line of receipt.lineItems) {
      const quantity = Number(line.quantityReceived);
      receivedByPoLine.set(line.poLineItemId, (receivedByPoLine.get(line.poLineItemId) || 0) + quantity);
      if (isGoodCondition(line.condition)) goodByPoLine.set(line.poLineItemId, (goodByPoLine.get(line.poLineItemId) || 0) + quantity);
    }
  }
  const money = (amount: number) => `${invoice.currency} ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const billed = new Map<string, number>();

  for (const invLine of invoice.lineItems) {
    if (!invLine.poLineItemId) {
      mismatches.push({ invoiceLineId: invLine.id, reason: 'no_po_line', detail: 'No matching PO line item specified.' });
      continue;
    }

    const poLine = invoice.purchaseOrder.lineItems.find((l) => l.id === invLine.poLineItemId);
    if (!poLine) {
      mismatches.push({ invoiceLineId: invLine.id, reason: 'no_po_line', detail: 'PO line item not found.' });
      continue;
    }

    const priceVariancePct =
      (Math.abs(Number(invLine.unitPrice) - Number(poLine.unitPrice)) / Number(poLine.unitPrice)) * 100;
    if (priceVariancePct > tolerancePct) {
      mismatches.push({
        invoiceLineId: invLine.id,
        reason: 'price_variance',
        detail: `Invoiced at ${invLine.unitPrice} vs PO price ${poLine.unitPrice} (${priceVariancePct.toFixed(1)}% variance).`,
      });
    }

    const received = receivedByPoLine.get(poLine.id) || 0;
    const good = goodByPoLine.get(poLine.id) || 0;
    const quantity = Number(invLine.quantity);
    billed.set(poLine.id, (billed.get(poLine.id) || 0) + quantity);
    if (quantity > received) {
      mismatches.push({
        invoiceLineId: invLine.id,
        reason: received === 0 ? 'not_received' : 'over_quantity',
        detail:
          `Invoicing ${invLine.quantity} units but only ${received} were received` +
          (good < received ? `, ${received - good} of them damaged or wrong.` : '.'),
      });
    } else if (quantity > good) {
      mismatches.push({
        invoiceLineId: invLine.id,
        reason: 'damaged',
        detail:
          `Invoicing ${invLine.quantity} units of "${poLine.description}" but ${received - good} of the ${received} received arrived damaged or wrong; ` +
          `only ${good} count as delivered. Credit due: ${money((quantity - good) * Number(poLine.unitPrice))}, unless a replacement is received.`,
      });
    }
  }

  // Damaged units the vendor isn't billing for: nothing to dispute, but say so.
  for (const poLine of invoice.purchaseOrder.lineItems) {
    const bad = (receivedByPoLine.get(poLine.id) || 0) - (goodByPoLine.get(poLine.id) || 0);
    const billedHere = billed.get(poLine.id);
    if (bad > 0 && billedHere !== undefined && billedHere <= (goodByPoLine.get(poLine.id) || 0)) {
      notes.push(`${bad} unit(s) of "${poLine.description}" arrived damaged or wrong and are not billed on this invoice.`);
    }
  }
  for (const vendorReturn of invoice.purchaseOrder.vendorReturns) {
    const due = vendorReturn.lineItems.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0);
    notes.push(
      vendorReturn.status === 'CREDITED'
        ? `Return ${vendorReturn.returnNumber}: credited ${money(Number(vendorReturn.creditAmount ?? 0))}${vendorReturn.creditReference ? ` (${vendorReturn.creditReference})` : ''}.`
        : `Return ${vendorReturn.returnNumber} is ${vendorReturn.status.toLowerCase()}: ${money(due)} credit due from the vendor.`
    );
  }

  return { matched: mismatches.length === 0, mismatches, notes };
};

export const applyMatchResult = async (
  teamId: string,
  invoiceId: string,
  result: { matched: boolean; mismatches: MatchMismatch[]; notes?: string[] }
) => {
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: result.matched ? InvoiceStatus.MATCHED : InvoiceStatus.MISMATCHED,
      matchStatus: result.matched ? '3-way match passed' : `${result.mismatches.length} mismatch(es) found`,
      matchNotes: [...result.mismatches.map((m) => m.detail), ...(result.notes ?? [])].join('\n') || null,
    },
  });
};

export const approveInvoice = async (teamId: string, id: string, reviewedById: string) => {
  await prisma.invoice.findFirstOrThrow({ where: { id, teamId } });
  const invoice = await prisma.invoice.update({
    where: { id },
    data: { status: InvoiceStatus.APPROVED, reviewedById },
  });
  // What was actually paid becomes Inventory's item cost.
  void afterInvoiceApproved(teamId, id);
  return invoice;
};
