import { prisma } from '@/lib/prisma';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';
import { ApiError } from '@/lib/errors';
import { applyBudgetTransaction } from './budget';

export const listPayments = async (teamId: string) => {
  return prisma.payment.findMany({
    where: { teamId },
    include: { vendor: true, invoice: { select: { id: true, invoiceNumber: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const schedulePayment = async (params: {
  teamId: string;
  vendorId: string;
  invoiceId?: string;
  amount: number;
  currency: string;
  method?: string;
  scheduledFor?: Date;
  reference?: string;
}) => {
  if (params.invoiceId) {
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { id: params.invoiceId, teamId: params.teamId },
    });
    const payableStatuses: InvoiceStatus[] = [InvoiceStatus.APPROVED, InvoiceStatus.MATCHED];
    if (!payableStatuses.includes(invoice.status)) {
      throw new ApiError(400, 'Only matched or approved invoices can be scheduled for payment.');
    }
  }

  return prisma.payment.create({ data: params });
};

export const markPaymentPaid = async (teamId: string, id: string, approvedById: string) => {
  const payment = await prisma.payment.findFirstOrThrow({ where: { id, teamId } });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id },
      data: { status: PaymentStatus.PAID, paidAt: new Date(), approvedById },
    });

    if (payment.invoiceId) {
      const invoice = await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: InvoiceStatus.PAID },
        include: { purchaseOrder: true },
      });

      if (invoice.purchaseOrder?.budgetId) {
        await applyBudgetTransaction({
          budgetId: invoice.purchaseOrder.budgetId,
          type: 'SPEND',
          amount: Number(payment.amount),
          reference: payment.id,
          note: `Payment for invoice ${invoice.invoiceNumber}`,
        });
      }
    }

    return updated;
  });
};
