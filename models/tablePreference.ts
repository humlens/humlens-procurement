import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export const getTablePreference = async (userId: string, tableKey: string) => {
  const preference = await prisma.tablePreference.findUnique({
    where: { userId_tableKey: { userId, tableKey } },
    select: { view: true, updatedAt: true },
  });
  return preference ?? null;
};

export const saveTablePreference = async (userId: string, tableKey: string, view: Prisma.InputJsonValue) => {
  return prisma.tablePreference.upsert({
    where: { userId_tableKey: { userId, tableKey } },
    create: { userId, tableKey, view },
    update: { view },
    select: { view: true, updatedAt: true },
  });
};

export const deleteTablePreference = async (userId: string, tableKey: string) => {
  await prisma.tablePreference.deleteMany({ where: { userId, tableKey } });
};
