-- CreateEnum
CREATE TYPE "ConnectionKind" AS ENUM ('INVENTORY', 'PROCUREMENT', 'COMMERCE');

-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "kind" "ConnectionKind" NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundEvent" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "target" "ConnectionKind" NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboundStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Connection_teamId_kind_key" ON "Connection"("teamId", "kind");

-- CreateIndex
CREATE INDEX "OutboundEvent_status_nextAttemptAt_idx" ON "OutboundEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OutboundEvent_teamId_createdAt_idx" ON "OutboundEvent"("teamId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundEvent_teamId_reference_key" ON "OutboundEvent"("teamId", "reference");

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEvent" ADD CONSTRAINT "OutboundEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

