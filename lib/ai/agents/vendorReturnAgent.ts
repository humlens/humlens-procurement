import { prisma } from '@/lib/prisma';
import { proposeAction } from 'models/agentAction';
import { isGoodCondition } from '@/lib/receiving';

// Runs after a goods receipt. Units recorded in a not-good condition
// ("damaged", "wrong item") are kept out of stock; this drafts the return to
// vendor for them, through the `vendorReturn.createDraft` action so it can be
// undone from the inbox. It only ever drafts: a person checks the return,
// contacts the vendor and marks it sent. No model call; the reason is written
// from the receipt itself.
export async function runVendorReturnAgent(teamId: string, receiptId: string) {
  const receipt = await prisma.goodsReceipt.findFirst({
    where: { id: receiptId, teamId },
    include: {
      purchaseOrder: { select: { id: true, poNumber: true, currency: true } },
      lineItems: { include: { poLineItem: { select: { description: true, unitPrice: true } } } },
      vendorReturns: { where: { status: { not: 'CANCELLED' } }, select: { id: true } },
    },
  });
  if (!receipt || receipt.vendorReturns.length) return null;

  const bad = receipt.lineItems.filter((line) => !isGoodCondition(line.condition) && Number(line.quantityReceived) > 0);
  if (!bad.length) return null;

  const units = bad.reduce((sum, line) => sum + Number(line.quantityReceived), 0);
  const credit = bad.reduce((sum, line) => sum + Number(line.quantityReceived) * Number(line.poLineItem.unitPrice), 0);
  const reason =
    `Received on ${receipt.purchaseOrder.poNumber} not in good condition: ` +
    bad.map((line) => `${Number(line.quantityReceived)} × ${line.poLineItem.description} (${line.condition!.trim()})`).join('; ') +
    '. Returning for a credit note or replacement.';

  return proposeAction({
    teamId,
    type: 'DRAFT_VENDOR_RETURN',
    agent: 'vendor-return',
    tool: 'vendorReturn.createDraft',
    args: {
      receiptId,
      reason,
      lineItems: bad.map((line) => ({ poLineItemId: line.poLineItemId, quantity: Number(line.quantityReceived), condition: line.condition!.trim() })),
    },
    purchaseOrderId: receipt.purchaseOrder.id,
    autoApply: true,
    evidence: [
      { label: 'Units', value: units },
      { label: 'Credit due', value: `${receipt.purchaseOrder.currency} ${credit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
    ],
    reasoning: 'Drafted a return to vendor for the units received damaged or wrong. It stays a draft until someone reviews it and sends it to the vendor.',
  });
}
