import { prisma } from '@/lib/prisma';
import { ContractStatus } from '@prisma/client';

export const listContracts = async (teamId: string) => {
  return prisma.contract.findMany({
    where: { teamId },
    include: { vendor: true },
    orderBy: { endDate: 'asc' },
  });
};

export const getContract = async (teamId: string, id: string) => {
  return prisma.contract.findFirstOrThrow({
    where: { id, teamId },
    include: { vendor: true, rfq: true, purchaseOrders: true },
  });
};

export const createContract = async (params: {
  teamId: string;
  createdById: string;
  vendorId: string;
  rfqId?: string;
  title: string;
  value?: number;
  currency: string;
  startDate: Date;
  endDate?: Date;
  autoRenew: boolean;
  documentUrl?: string;
}) => {
  return prisma.contract.create({ data: { ...params, status: ContractStatus.ACTIVE } });
};

// Flags contracts ending within `withinDays` as EXPIRING_SOON. Intended to
// run on a schedule (see workers/) so renewal/sourcing agents can react.
export const flagExpiringContracts = async (teamId: string, withinDays = 30) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  return prisma.contract.updateMany({
    where: {
      teamId,
      status: ContractStatus.ACTIVE,
      endDate: { lte: cutoff, not: null },
    },
    data: { status: ContractStatus.EXPIRING_SOON },
  });
};
