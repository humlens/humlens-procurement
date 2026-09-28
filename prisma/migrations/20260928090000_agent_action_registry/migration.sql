-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentActionStatus" ADD VALUE 'REVERTED';
ALTER TYPE "AgentActionStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "AgentAction" ADD COLUMN     "agent" TEXT,
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "aiTokens" INTEGER,
ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "appliedById" TEXT,
ADD COLUMN     "args" JSONB,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "evidence" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "requestedById" TEXT,
ADD COLUMN     "result" JSONB,
ADD COLUMN     "revertedAt" TIMESTAMP(3),
ADD COLUMN     "revertedById" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "tool" TEXT;

-- CreateIndex
CREATE INDEX "AgentAction_teamId_status_idx" ON "AgentAction"("teamId", "status");


-- Backfill: name the agent behind existing rows, describe their changes in
-- the registry's terms where there's enough to undo them, and give every
-- row a readable title for the inbox.
UPDATE "AgentAction" SET "agent" = CASE "type"
  WHEN 'AUTO_APPROVE_REQUISITION' THEN 'approval'
  WHEN 'AUTO_MATCH_INVOICE' THEN 'invoice-match'
  WHEN 'NL_REQUISITION_DRAFT' THEN 'nl-requisition'
  WHEN 'DRAFT_RFQ_OUTREACH' THEN 'sourcing'
  WHEN 'SPEND_ANOMALY_ALERT' THEN 'spend-anomaly'
  ELSE NULL END;

-- Requisition steps the agent approved on its own.
UPDATE "AgentAction"
SET "tool" = 'requisition.approveStep',
    "args" = jsonb_build_object('requisitionId', "requisitionId", 'stepId', "output"->>'stepId'),
    "result" = jsonb_build_object('stepId', "output"->>'stepId'),
    "appliedAt" = "createdAt"
WHERE "type" = 'AUTO_APPROVE_REQUISITION' AND "status" = 'EXECUTED' AND "requisitionId" IS NOT NULL AND "output"->>'stepId' IS NOT NULL;

-- Draft requisitions written from plain English.
UPDATE "AgentAction"
SET "tool" = 'requisition.createDraft',
    "result" = jsonb_build_object('requisitionId', "requisitionId"),
    "appliedAt" = "createdAt"
WHERE "type" = 'NL_REQUISITION_DRAFT' AND "status" = 'EXECUTED' AND "requisitionId" IS NOT NULL;

-- Policy blocks had nothing to approve, and older invoice matches can't be
-- undone (the previous status wasn't kept): close them.
UPDATE "AgentAction" SET "reviewedAt" = "createdAt"
WHERE "reviewedAt" IS NULL AND ("status" = 'REJECTED_BY_POLICY' OR ("type" = 'AUTO_MATCH_INVOICE' AND "tool" IS NULL));

UPDATE "AgentAction" SET "title" = CASE
  WHEN "type" = 'AUTO_APPROVE_REQUISITION' AND "status" = 'EXECUTED' THEN 'Approved a requisition step within policy'
  WHEN "type" = 'AUTO_APPROVE_REQUISITION' THEN 'Requisition left for a person to approve'
  WHEN "type" = 'AUTO_MATCH_INVOICE' THEN 'Invoice three-way match'
  WHEN "type" = 'NL_REQUISITION_DRAFT' THEN 'Draft requisition from a plain-English request'
  WHEN "type" = 'DRAFT_RFQ_OUTREACH' THEN 'Vendor outreach emails drafted'
  WHEN "type" = 'SPEND_ANOMALY_ALERT' THEN 'Unusual vendor spend'
  ELSE 'Agent action' END
WHERE "title" IS NULL;
