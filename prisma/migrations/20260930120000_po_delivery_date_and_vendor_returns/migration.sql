-- Promised delivery date on purchase orders, for the scorecard's on-time rate.
ALTER TABLE "PurchaseOrder" ADD COLUMN "expectedDeliveryDate" DATE;

-- Return to vendor (RTV) documents, drafted by the vendor-return agent.
ALTER TYPE "AgentActionType" ADD VALUE IF NOT EXISTS 'DRAFT_VENDOR_RETURN';

-- CreateEnum
CREATE TYPE "VendorReturnStatus" AS ENUM ('DRAFT', 'SENT', 'CREDITED', 'CANCELLED');

-- CreateTable
CREATE TABLE "VendorReturn" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "status" "VendorReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "creditAmount" DECIMAL(14,2),
    "creditReference" TEXT,
    "sentAt" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorReturnLineItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "poLineItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "condition" TEXT,

    CONSTRAINT "VendorReturnLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorReturn_teamId_idx" ON "VendorReturn"("teamId");

-- CreateIndex
CREATE INDEX "VendorReturn_vendorId_idx" ON "VendorReturn"("vendorId");

-- CreateIndex
CREATE INDEX "VendorReturn_poId_idx" ON "VendorReturn"("poId");

-- CreateIndex
CREATE INDEX "VendorReturn_receiptId_idx" ON "VendorReturn"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorReturn_teamId_returnNumber_key" ON "VendorReturn"("teamId", "returnNumber");

-- CreateIndex
CREATE INDEX "VendorReturnLineItem_returnId_idx" ON "VendorReturnLineItem"("returnId");

-- CreateIndex
CREATE INDEX "VendorReturnLineItem_poLineItemId_idx" ON "VendorReturnLineItem"("poLineItemId");

-- AddForeignKey
ALTER TABLE "VendorReturn" ADD CONSTRAINT "VendorReturn_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturn" ADD CONSTRAINT "VendorReturn_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturn" ADD CONSTRAINT "VendorReturn_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturn" ADD CONSTRAINT "VendorReturn_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturnLineItem" ADD CONSTRAINT "VendorReturnLineItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "VendorReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReturnLineItem" ADD CONSTRAINT "VendorReturnLineItem_poLineItemId_fkey" FOREIGN KEY ("poLineItemId") REFERENCES "POLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

