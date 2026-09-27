import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

export const getUserByEmail = async (email: string) => {
  return prisma.user.findUnique({ where: { email } });
};

export const getUserById = async (id: string) => {
  return prisma.user.findUniqueOrThrow({ where: { id } });
};

export const createUser = async (params: {
  name: string;
  email: string;
  password: string;
}) => {
  const { name, email, password } = params;

  return prisma.user.create({
    data: {
      name,
      email,
      password: await hashPassword(password),
    },
  });
};

export const normalizeUser = <T extends { password?: string | null }>(
  user: T
): Omit<T, 'password'> => {
  const { password: _password, ...rest } = user;
  return rest;
};
