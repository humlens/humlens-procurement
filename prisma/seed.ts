import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../lib/auth';

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.upsert({
    where: { email: 'owner@example.com' },
    create: { name: 'Sam Owner', email: 'owner@example.com', password: await hashPassword('password123') },
    update: {},
  });

  const team = await prisma.team.upsert({
    where: { slug: 'demo' },
    create: { name: 'Demo Procurement Co', slug: 'demo' },
    update: {},
  });

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: owner.id } },
    create: { teamId: team.id, userId: owner.id, role: Role.OWNER },
    update: { role: Role.OWNER },
  });

  await prisma.agentPolicy.upsert({
    where: { teamId: team.id },
    create: { teamId: team.id, autoApproveEnabled: true, autoApproveMaxAmount: 500 },
    update: {},
  });

  await prisma.approvalWorkflow.upsert({
    where: { id: 'seed-workflow-small' },
    create: {
      id: 'seed-workflow-small',
      teamId: team.id,
      name: 'Under $1,000',
      minAmount: 0,
      maxAmount: 1000,
      approverRoles: [Role.APPROVER],
    },
    update: {},
  });

  await prisma.approvalWorkflow.upsert({
    where: { id: 'seed-workflow-large' },
    create: {
      id: 'seed-workflow-large',
      teamId: team.id,
      name: '$1,000+',
      minAmount: 1000,
      approverRoles: [Role.APPROVER, Role.ADMIN],
      isDefault: true,
    },
    update: {},
  });

  const department = await prisma.department.upsert({
    where: { teamId_name: { teamId: team.id, name: 'Operations' } },
    create: { teamId: team.id, name: 'Operations' },
    update: {},
  });

  await prisma.budget.upsert({
    where: { id: 'seed-budget-ops' },
    create: {
      id: 'seed-budget-ops',
      teamId: team.id,
      departmentId: department.id,
      name: 'Operations FY26',
      period: 'ANNUAL',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      allocatedAmount: 100000,
    },
    update: {},
  });

  await prisma.vendor.upsert({
    where: { teamId_name: { teamId: team.id, name: 'Acme Office Supply' } },
    create: {
      teamId: team.id,
      name: 'Acme Office Supply',
      status: 'ACTIVE',
      createdById: owner.id,
      email: 'sales@acme-office.example',
      paymentTerms: 'NET30',
    },
    update: {},
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded team "${team.slug}" — sign in as owner@example.com / password123`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
