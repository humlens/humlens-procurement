import { prisma } from '@/lib/prisma';
import { AgentActionStatus, AgentActionType, Prisma } from '@prisma/client';

export const listAgentActions = async (teamId: string, limit = 50) => {
  return prisma.agentAction.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { reviewedBy: { select: { id: true, name: true } } },
  });
};

export const logAgentAction = async (params: {
  teamId: string;
  type: AgentActionType;
  status: AgentActionStatus;
  requisitionId?: string;
  purchaseOrderId?: string;
  invoiceId?: string;
  input?: Prisma.InputJsonValue;
  output?: Prisma.InputJsonValue;
  reasoning?: string;
  confidence?: number;
}) => {
  return prisma.agentAction.create({
    data: {
      ...params,
      input: params.input ?? {},
      output: params.output ?? {},
    },
  });
};

export const reviewAgentAction = async (
  teamId: string,
  id: string,
  reviewedById: string,
  status: AgentActionStatus
) => {
  await prisma.agentAction.findFirstOrThrow({ where: { id, teamId } });
  return prisma.agentAction.update({
    where: { id },
    data: { status, reviewedById, reviewedAt: new Date() },
  });
};

export const getAgentPolicy = async (teamId: string) => {
  return prisma.agentPolicy.upsert({
    where: { teamId },
    create: { teamId },
    update: {},
  });
};

export const updateAgentPolicy = async (teamId: string, data: Record<string, unknown>) => {
  return prisma.agentPolicy.upsert({
    where: { teamId },
    create: { teamId, ...data },
    update: data,
  });
};
