import { prisma } from '@/lib/prisma';
import { VendorStatus } from '@prisma/client';

export const listVendors = async (teamId: string, params?: { status?: VendorStatus; search?: string }) => {
  return prisma.vendor.findMany({
    where: {
      teamId,
      status: params?.status,
      name: params?.search ? { contains: params.search, mode: 'insensitive' } : undefined,
    },
    include: { category: true, _count: { select: { purchaseOrders: true, contracts: true } } },
    orderBy: { name: 'asc' },
  });
};

export const getVendor = async (teamId: string, id: string) => {
  return prisma.vendor.findFirstOrThrow({
    where: { id, teamId },
    include: {
      category: true,
      contacts: true,
      performanceReviews: { orderBy: { createdAt: 'desc' }, take: 10 },
      contracts: { orderBy: { createdAt: 'desc' } },
      purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
};

export const createVendor = async (params: {
  teamId: string;
  createdById: string;
  name: string;
  legalName?: string;
  categoryId?: string;
  taxId?: string;
  website?: string;
  email?: string;
  phone?: string;
  paymentTerms?: string;
  preferredCurrency?: string;
  status?: VendorStatus;
}) => {
  return prisma.vendor.create({ data: params });
};

export const updateVendor = async (teamId: string, id: string, data: Record<string, unknown>) => {
  await prisma.vendor.findFirstOrThrow({ where: { id, teamId } });
  return prisma.vendor.update({ where: { id }, data });
};

export const setVendorStatus = async (teamId: string, id: string, status: VendorStatus) => {
  await prisma.vendor.findFirstOrThrow({ where: { id, teamId } });
  return prisma.vendor.update({ where: { id }, data: { status } });
};

export const addVendorPerformanceReview = async (params: {
  teamId: string;
  vendorId: string;
  score: number;
  onTimeRate?: number;
  qualityRate?: number;
  comment?: string;
}) => {
  const review = await prisma.vendorPerformanceReview.create({ data: params });

  const reviews = await prisma.vendorPerformanceReview.findMany({
    where: { vendorId: params.vendorId },
    select: { score: true },
  });
  const avg = reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;
  await prisma.vendor.update({ where: { id: params.vendorId }, data: { rating: avg } });

  return review;
};
