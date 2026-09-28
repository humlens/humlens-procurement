-- CreateEnum
CREATE TYPE "AccountingRecordKind" AS ENUM ('VENDOR', 'PURCHASE_ORDER', 'BILL', 'PAYMENT');

-- CreateEnum
CREATE TYPE "PunchoutProtocol" AS ENUM ('CXML', 'OCI');

-- CreateEnum
CREATE TYPE "PunchoutSessionStatus" AS ENUM ('STARTED', 'RETURNED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConnectionKind" ADD VALUE 'ACCOUNTING';
ALTER TYPE "ConnectionKind" ADD VALUE 'SUPPLIER';

-- CreateTable
CREATE TABLE "AccountingLink" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "kind" "AccountingRecordKind" NOT NULL,
    "localId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalNumber" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchoutCatalog" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "protocol" "PunchoutProtocol" NOT NULL DEFAULT 'CXML',
    "setupUrl" TEXT NOT NULL,
    "fromDomain" TEXT NOT NULL DEFAULT 'NetworkID',
    "fromIdentity" TEXT,
    "toDomain" TEXT NOT NULL DEFAULT 'NetworkID',
    "toIdentity" TEXT,
    "senderIdentity" TEXT,
    "username" TEXT,
    "secret" TEXT,
    "orderUrl" TEXT,
    "sendOrders" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PunchoutCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchoutSession" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "requisitionId" TEXT,
    "status" "PunchoutSessionStatus" NOT NULL DEFAULT 'STARTED',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "PunchoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingLink_teamId_kind_idx" ON "AccountingLink"("teamId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingLink_teamId_kind_localId_key" ON "AccountingLink"("teamId", "kind", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "PunchoutCatalog_vendorId_key" ON "PunchoutCatalog"("vendorId");

-- CreateIndex
CREATE INDEX "PunchoutCatalog_teamId_idx" ON "PunchoutCatalog"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "PunchoutSession_token_key" ON "PunchoutSession"("token");

-- CreateIndex
CREATE INDEX "PunchoutSession_teamId_idx" ON "PunchoutSession"("teamId");

-- AddForeignKey
ALTER TABLE "AccountingLink" ADD CONSTRAINT "AccountingLink_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchoutCatalog" ADD CONSTRAINT "PunchoutCatalog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchoutCatalog" ADD CONSTRAINT "PunchoutCatalog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchoutSession" ADD CONSTRAINT "PunchoutSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchoutSession" ADD CONSTRAINT "PunchoutSession_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "PunchoutCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

