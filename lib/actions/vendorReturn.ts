import { VendorReturnStatus } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { cancelVendorReturn, createVendorReturnDraft, expectedCredit } from 'models/vendorReturn';
import { defineAction } from './types';

const input = z.object({
  receiptId: z.string().min(1),
  reason: z.string().max(1000).optional(),
  lineItems: z
    .array(z.object({ poLineItemId: z.string().min(1), quantity: z.number().positive(), condition: z.string().max(200).optional() }))
    .min(1),
});
type Input = z.infer<typeof input>;

// Drafts a return to vendor for goods that arrived damaged or wrong. Only a
// draft: a person reviews it, contacts the vendor and marks it sent.
export const createVendorReturnDraftAction = defineAction<Input, { vendorReturnId: string }>({
  name: 'vendorReturn.createDraft',
  label: 'Draft a return to vendor',
  resource: 'vendor_return',
  permission: 'create',
  input,
  async describe(teamId, params) {
    const receipt = await prisma.goodsReceipt.findFirst({
      where: { id: params.receiptId, teamId },
      select: { purchaseOrder: { select: { poNumber: true, currency: true, vendor: { select: { name: true } }, lineItems: { select: { id: true, unitPrice: true } } } } },
    });
    if (!receipt) throw new ApiError(404, 'That goods receipt is not in this team.');
    const po = receipt.purchaseOrder;
    const units = params.lineItems.reduce((sum, line) => sum + line.quantity, 0);
    const credit = expectedCredit(
      params.lineItems.map((line) => ({ quantity: line.quantity, unitPrice: po.lineItems.find((l) => l.id === line.poLineItemId)?.unitPrice ?? 0 }))
    );
    return `Return ${units} unit${units === 1 ? '' : 's'} on ${po.poNumber} to ${po.vendor.name} (${po.currency} ${credit.toLocaleString()} credit due)`;
  },
  async apply(ctx, params) {
    const vendorReturn = await createVendorReturnDraft({ teamId: ctx.teamId, ...params });
    return { vendorReturnId: vendorReturn.id };
  },
  // Only a draft can be taken back; once it's been sent it's a real conversation with the vendor.
  async revert(ctx, result) {
    const vendorReturn = await prisma.vendorReturn.findFirst({ where: { id: result.vendorReturnId, teamId: ctx.teamId }, select: { status: true, returnNumber: true } });
    if (!vendorReturn) throw new ApiError(404, 'That return no longer exists.');
    if (vendorReturn.status !== VendorReturnStatus.DRAFT) {
      throw new ApiError(409, `${vendorReturn.returnNumber} is ${vendorReturn.status.toLowerCase()}, so it can't be undone here.`);
    }
    await cancelVendorReturn(ctx.teamId, result.vendorReturnId);
  },
  link: (_params, result) => (result ? `vendor-returns/${result.vendorReturnId}` : 'vendor-returns'),
});
