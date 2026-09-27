import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';

export const listApprovalWorkflows = async (teamId: string) => {
  return prisma.approvalWorkflow.findMany({ where: { teamId }, orderBy: { minAmount: 'asc' } });
};

export const createApprovalWorkflow = async (params: {
  teamId: string;
  name: string;
  minAmount: number;
  maxAmount?: number;
  approverRoles: Role[];
  isDefault?: boolean;
}) => {
  return prisma.approvalWorkflow.create({ data: params });
};

// Finds the band that covers `amount`, falling back to the default workflow,
// then to a single-ADMIN-approval workflow if the team hasn't configured one
// yet (so requisitions never get stuck with zero approval steps).
export const resolveApprovalWorkflow = async (teamId: string, amount: number) => {
  const workflows = await prisma.approvalWorkflow.findMany({ where: { teamId } });

  const band = workflows.find(
    (w) => amount >= Number(w.minAmount) && (w.maxAmount === null || amount <= Number(w.maxAmount))
  );
  if (band) return band;

  const fallback = workflows.find((w) => w.isDefault);
  if (fallback) return fallback;

  return { approverRoles: [Role.ADMIN] as Role[] };
};
