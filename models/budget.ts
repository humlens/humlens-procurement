import { prisma } from '@/lib/prisma';
import { BudgetTransactionType } from '@prisma/client';
import { ApiError } from '@/lib/errors';

export const listBudgets = async (teamId: string) => {
  return prisma.budget.findMany({
    where: { teamId },
    include: { department: true },
    orderBy: { startDate: 'desc' },
  });
};

export const getBudget = async (teamId: string, id: string) => {
  return prisma.budget.findFirstOrThrow({
    where: { id, teamId },
    include: { department: true, transactions: { orderBy: { createdAt: 'desc' }, take: 25 } },
  });
};

export const createBudget = async (params: {
  teamId: string;
  name: string;
  departmentId?: string;
  period: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  startDate: Date;
  endDate: Date;
  allocatedAmount: number;
  currency: string;
}) => {
  return prisma.budget.create({ data: params });
};

// Every dollar committed to a requisition/PO or spent on an invoice is
// tracked as a BudgetTransaction, and Budget.committedAmount/spentAmount are
// kept in sync in the same transaction so "available" is always derivable
// as allocated - committed - spent without re-summing history.
export const applyBudgetTransaction = async (params: {
  budgetId: string;
  type: BudgetTransactionType;
  amount: number;
  reference?: string;
  note?: string;
}) => {
  const { budgetId, type, amount, reference, note } = params;

  return prisma.$transaction(async (tx) => {
    const budget = await tx.budget.findUniqueOrThrow({ where: { id: budgetId } });

    const field = type === 'SPEND' ? 'spentAmount' : 'committedAmount';
    const delta = type === 'RELEASE' ? -amount : amount;

    if (type === 'COMMIT') {
      const available =
        Number(budget.allocatedAmount) - Number(budget.committedAmount) - Number(budget.spentAmount);
      if (amount > available) {
        throw new ApiError(
          400,
          `This exceeds the available budget (${available.toFixed(2)} ${budget.currency} remaining).`
        );
      }
    }

    await tx.budgetTransaction.create({
      data: { budgetId, type, amount, reference, note },
    });

    return tx.budget.update({
      where: { id: budgetId },
      data: { [field]: { increment: delta } },
    });
  });
};
