import { prisma } from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

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
  reason: 'no_po_line' | 'price_variance' | 'over_quantity' | 'not_received';
  detail: string;
};

// Core 3-way match: PO (what was ordered/priced) x GoodsReceipt (what
// physically arrived) x Invoice (what the vendor is billing). Shared by the
// manual "Review match" API route and the autonomous matching agent so both
// paths apply identical rules — see lib/ai/agents/invoiceMatchAgent.ts.
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
        include: { lineItems: true, goodsReceipts: { include: { lineItems: true } } },
      },
    },
  });

  const mismatches: MatchMismatch[] = [];

  if (!invoice.purchaseOrder) {
    return { matched: false, mismatches: [{ invoiceLineId: '', reason: 'no_po_line', detail: 'Invoice is not linked to a purchase order.' }] as MatchMismatch[] };
  }

  const receivedByPoLine = new Map<string, number>();
  for (const receipt of invoice.purchaseOrder.goodsReceipts) {
    for (const line of receipt.lineItems) {
      receivedByPoLine.set(
        line.poLineItemId,
        (receivedByPoLine.get(line.poLineItemId) || 0) + Number(line.quantityReceived)
      );
    }
  }

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
    if (Number(invLine.quantity) > received) {
      mismatches.push({
        invoiceLineId: invLine.id,
        reason: received === 0 ? 'not_received' : 'over_quantity',
        detail: `Invoicing ${invLine.quantity} units but only ${received} were received.`,
      });
    }
  }

  return { matched: mismatches.length === 0, mismatches };
};

export const applyMatchResult = async (
  teamId: string,
  invoiceId: string,
  result: { matched: boolean; mismatches: MatchMismatch[] }
) => {
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: result.matched ? InvoiceStatus.MATCHED : InvoiceStatus.MISMATCHED,
      matchStatus: result.matched ? '3-way match passed' : `${result.mismatches.length} mismatch(es) found`,
      matchNotes: result.mismatches.map((m) => m.detail).join('\n') || null,
    },
  });
};

export const approveInvoice = async (teamId: string, id: string, reviewedById: string) => {
  await prisma.invoice.findFirstOrThrow({ where: { id, teamId } });
  return prisma.invoice.update({
    where: { id },
    data: { status: InvoiceStatus.APPROVED, reviewedById },
  });
};
