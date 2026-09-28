import { prisma } from '@/lib/prisma';
import { InvoiceStatus, PaymentStatus, type Prisma } from '@prisma/client';
import { ApiError } from '@/lib/errors';
import { applyBudgetTransaction } from './budget';
import { afterPaymentPaid } from '@/lib/operations';

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

// Pays an invoice-linked payment: the invoice becomes PAID and the spend is
// booked against the PO's budget. Shared by "mark paid" and payments that
// come back from the accounting system.
const settle = async (
  tx: Prisma.TransactionClient,
  payment: { id: string; invoiceId: string | null; amount: Prisma.Decimal | number }
) => {
  if (!payment.invoiceId) return;
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
};

export const markPaymentPaid = async (teamId: string, id: string, approvedById: string) => {
  await prisma.payment.findFirstOrThrow({ where: { id, teamId } });

  const updated = await prisma.$transaction(async (tx) => {
    const paid = await tx.payment.update({
      where: { id },
      data: { status: PaymentStatus.PAID, paidAt: new Date(), approvedById },
    });
    await settle(tx, paid);
    return paid;
  });
  void afterPaymentPaid(teamId, id);
  return updated;
};

/** A payment that already happened elsewhere (e.g. paid in the accounting system). */
export const recordPayment = async (params: {
  teamId: string;
  vendorId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  method: string;
}) =>
  prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({ data: { ...params, status: PaymentStatus.PAID, paidAt: new Date() } });
    await settle(tx, payment);
    return payment;
  });
