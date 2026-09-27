import { prisma } from '@/lib/prisma';
import { POStatus, ReceiptStatus } from '@prisma/client';

export const listGoodsReceipts = async (teamId: string, poId?: string) => {
  return prisma.goodsReceipt.findMany({
    where: { teamId, poId },
    include: { purchaseOrder: { select: { id: true, poNumber: true } }, lineItems: true },
    orderBy: { receivedAt: 'desc' },
  });
};

// Records a GRN against a PO's line items, bumps each line's receivedQty,
// and rolls the PO status to PARTIALLY_RECEIVED or RECEIVED depending on
// whether every line is now fully received.
export const createGoodsReceipt = async (params: {
  teamId: string;
  poId: string;
  receivedById: string;
  notes?: string;
  lineItems: { poLineItemId: string; quantityReceived: number; condition?: string }[];
}) => {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findFirstOrThrow({
      where: { id: params.poId, teamId: params.teamId },
      include: { lineItems: true },
    });

    const receipt = await tx.goodsReceipt.create({
      data: {
        teamId: params.teamId,
        poId: params.poId,
        receivedById: params.receivedById,
        notes: params.notes,
        status: ReceiptStatus.COMPLETE,
        lineItems: { create: params.lineItems },
      },
      include: { lineItems: true },
    });

    for (const line of params.lineItems) {
      await tx.pOLineItem.update({
        where: { id: line.poLineItemId },
        data: { receivedQty: { increment: line.quantityReceived } },
      });
    }

    const updatedLines = await tx.pOLineItem.findMany({ where: { poId: params.poId } });
    const fullyReceived = updatedLines.every((l) => Number(l.receivedQty) >= Number(l.quantity));
    const anyReceived = updatedLines.some((l) => Number(l.receivedQty) > 0);

    await tx.purchaseOrder.update({
      where: { id: params.poId },
      data: {
        status: fullyReceived
          ? POStatus.RECEIVED
          : anyReceived
            ? POStatus.PARTIALLY_RECEIVED
            : po.status,
      },
    });

    return receipt;
  });
};
