import { prisma } from '@/lib/prisma';
import { getConnection } from '@/lib/connections';
import { enqueue, notifyStore } from '@/lib/outbox';
import { queueAccountingSync } from '@/lib/accounting/sync';
import { queueSupplierOrder } from '@/lib/punchout/orders';

// What happens in the other Humlens apps when something happens here:
//
//   goods received ──► Inventory stock in (and the store is told)
//   invoice approved ─► Inventory item costs (moving average)
//   store's purchase request changes ─► the store refreshes its status
//   PO issued / invoice approved / payment made ─► the accounting system
//   PO issued to a PunchOut supplier ─► a cXML order to that supplier
//
// All queued through the outbox, so an unreachable app just delays them.
// Called after the change is committed; failures are logged, never thrown.

const quietly = (label: string, work: () => Promise<unknown>) =>
  work().catch((error) => console.error(`Operations: ${label} failed`, error));

// Same reference the store uses when it forwards a receipt, so Inventory
// counts each receipt once whichever app delivers it first.
export const receiptReference = (receiptId: string) => `procurement:receipt:${receiptId}`;

export const afterGoodsReceipt = (teamId: string, receiptId: string) =>
  quietly('goods receipt', async () => {
    const receipt = await prisma.goodsReceipt.findFirst({
      where: { id: receiptId, teamId },
      include: {
        purchaseOrder: { select: { poNumber: true, requisitionId: true } },
        lineItems: { include: { poLineItem: { select: { sku: true, description: true } } } },
      },
    });
    if (!receipt) return;

    const inventory = await getConnection(teamId, 'INVENTORY');
    const lines = receipt.lineItems
      .filter((line) => line.poLineItem.sku && Number(line.quantityReceived) > 0)
      .map((line) => ({ sku: line.poLineItem.sku!, quantity: Math.round(Number(line.quantityReceived)) }))
      .filter((line) => line.quantity > 0);

    if (inventory?.options.pushReceipts && lines.length) {
      await enqueue({
        teamId,
        target: 'INVENTORY',
        kind: 'stock.receipt',
        reference: receiptReference(receipt.id),
        payload: {
          call: {
            method: 'POST',
            path: '/stock-movements',
            body: {
              type: 'receipt',
              reference: receiptReference(receipt.id),
              note: `${receipt.purchaseOrder.poNumber} received in Procurement`,
              ...(inventory.options.warehouseId ? { warehouseId: inventory.options.warehouseId } : {}),
              lines,
            },
          },
        },
      });
    }

    await notifyStore(teamId, 'receipt.created', { receiptId: receipt.id, poNumber: receipt.purchaseOrder.poNumber });
    if (receipt.purchaseOrder.requisitionId) await notifyRequisition(teamId, receipt.purchaseOrder.requisitionId);
  });

// The invoice is the price actually paid: send each line's unit price for
// its SKU so Inventory's item cost follows real purchase prices.
export const afterInvoiceApproved = (teamId: string, invoiceId: string) =>
  Promise.all([
    quietly('invoice to accounting', () => queueAccountingSync(teamId, 'BILL', invoiceId)),
    pushInvoiceCosts(teamId, invoiceId),
  ]);

const pushInvoiceCosts = (teamId: string, invoiceId: string) =>
  quietly('invoice costs', async () => {
    const inventory = await getConnection(teamId, 'INVENTORY');
    if (!inventory?.options.pushCosts) return;

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, teamId },
      include: { lineItems: { include: { poLineItem: { select: { sku: true } } } } },
    });
    if (!invoice) return;

    const bySku = new Map<string, { quantity: number; amount: number }>();
    for (const line of invoice.lineItems) {
      const sku = line.poLineItem?.sku;
      const quantity = Number(line.quantity);
      if (!sku || quantity <= 0) continue;
      const current = bySku.get(sku) ?? { quantity: 0, amount: 0 };
      bySku.set(sku, { quantity: current.quantity + quantity, amount: current.amount + quantity * Number(line.unitPrice) });
    }
    const lines = [...bySku].map(([sku, { quantity, amount }]) => ({
      sku,
      quantity: Math.max(1, Math.round(quantity)),
      unitCost: Math.round((amount / quantity) * 100) / 100,
    }));
    if (!lines.length) return;

    const reference = `procurement:invoice:${invoice.id}`;
    await enqueue({
      teamId,
      target: 'INVENTORY',
      kind: 'item-costs',
      reference,
      payload: { call: { method: 'POST', path: '/item-costs', body: { reference, lines } } },
    });
  });

// Tells the store when a purchase request it raised moves on (approved,
// rejected, turned into a PO, received…) so it doesn't wait for its next sync.
export async function notifyRequisition(teamId: string, requisitionId: string) {
  const requisition = await prisma.purchaseRequisition.findFirst({
    where: { id: requisitionId, teamId },
    select: { id: true, status: true, externalReference: true },
  });
  if (!requisition?.externalReference?.startsWith('store:')) return;
  await notifyStore(teamId, 'requisition.updated', {
    requisitionId: requisition.id,
    externalReference: requisition.externalReference,
    status: requisition.status,
  });
}

export const afterRequisitionChange = (teamId: string, requisitionId: string | null | undefined) =>
  requisitionId ? quietly('requisition update', () => notifyRequisition(teamId, requisitionId)) : Promise.resolve();

export const afterPurchaseOrderChange = (teamId: string, poId: string) =>
  quietly('purchase order update', async () => {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, teamId }, select: { requisitionId: true } });
    if (po?.requisitionId) await notifyRequisition(teamId, po.requisitionId);
  });

export const afterPurchaseOrderIssued = (teamId: string, poId: string) =>
  Promise.all([
    quietly('purchase order to accounting', () => queueAccountingSync(teamId, 'PURCHASE_ORDER', poId)),
    quietly('purchase order to supplier', () => queueSupplierOrder(teamId, poId)),
  ]);

export const afterPaymentPaid = (teamId: string, paymentId: string) =>
  quietly('payment to accounting', () => queueAccountingSync(teamId, 'PAYMENT', paymentId));
