import { prisma } from '@/lib/prisma';
import { RFQStatus, QuoteStatus } from '@prisma/client';
import { ApiError } from '@/lib/errors';

export const listRfqs = async (teamId: string) => {
  return prisma.rFQ.findMany({
    where: { teamId },
    include: { _count: { select: { quotes: true, vendorInvites: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const getRfq = async (teamId: string, id: string) => {
  return prisma.rFQ.findFirstOrThrow({
    where: { id, teamId },
    include: {
      lineItems: true,
      vendorInvites: { include: { vendor: true } },
      quotes: { include: { vendor: true, lineItems: true }, orderBy: { totalAmount: 'asc' } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
};

export const createRfq = async (params: {
  teamId: string;
  createdById: string;
  title: string;
  description?: string;
  dueDate?: Date;
  vendorIds: string[];
  lineItems: { description: string; quantity: number; unit?: string }[];
}) => {
  return prisma.rFQ.create({
    data: {
      teamId: params.teamId,
      createdById: params.createdById,
      title: params.title,
      description: params.description,
      dueDate: params.dueDate,
      status: RFQStatus.SENT,
      lineItems: { create: params.lineItems },
      vendorInvites: { create: params.vendorIds.map((vendorId) => ({ vendorId })) },
    },
    include: { lineItems: true, vendorInvites: true },
  });
};

export const submitQuote = async (params: {
  teamId: string;
  rfqId: string;
  vendorId: string;
  totalAmount: number;
  currency: string;
  leadTimeDays?: number;
  notes?: string;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
}) => {
  await prisma.rFQ.findFirstOrThrow({ where: { id: params.rfqId, teamId: params.teamId } });

  const quote = await prisma.quote.create({
    data: {
      rfqId: params.rfqId,
      vendorId: params.vendorId,
      totalAmount: params.totalAmount,
      currency: params.currency,
      leadTimeDays: params.leadTimeDays,
      notes: params.notes,
      lineItems: { create: params.lineItems },
    },
  });

  await prisma.rFQVendor.updateMany({
    where: { rfqId: params.rfqId, vendorId: params.vendorId },
    data: { status: 'QUOTED' },
  });

  await prisma.rFQ.update({
    where: { id: params.rfqId },
    data: { status: RFQStatus.QUOTES_RECEIVED },
  });

  return quote;
};

export const awardQuote = async (teamId: string, rfqId: string, quoteId: string) => {
  const quote = await prisma.quote.findFirstOrThrow({
    where: { id: quoteId, rfqId },
  });

  if (quote.status === QuoteStatus.AWARDED) {
    throw new ApiError(400, 'This quote has already been awarded.');
  }

  return prisma.$transaction(async (tx) => {
    await tx.quote.updateMany({
      where: { rfqId, id: { not: quoteId } },
      data: { status: QuoteStatus.REJECTED },
    });
    await tx.quote.update({ where: { id: quoteId }, data: { status: QuoteStatus.AWARDED } });
    return tx.rFQ.update({
      where: { id: rfqId, teamId },
      data: { status: RFQStatus.AWARDED, awardedVendorId: quote.vendorId },
    });
  });
};
