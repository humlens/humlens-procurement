-- AlterTable
ALTER TABLE "PurchaseRequisition" ADD COLUMN     "externalReference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisition_teamId_externalReference_key" ON "PurchaseRequisition"("teamId", "externalReference");
