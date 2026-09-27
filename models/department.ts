import { prisma } from '@/lib/prisma';

export const listDepartments = async (teamId: string) => {
  return prisma.department.findMany({ where: { teamId }, orderBy: { name: 'asc' } });
};

export const createDepartment = async (params: {
  teamId: string;
  name: string;
  code?: string;
  costCenter?: string;
}) => {
  return prisma.department.create({ data: params });
};
