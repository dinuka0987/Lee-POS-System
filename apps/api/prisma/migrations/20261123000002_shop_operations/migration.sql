-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "branch_id" UUID;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "receipt_settings" JSONB,
ADD COLUMN     "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auth_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "shop_settings" (
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Lee',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "receipt_footer" TEXT NOT NULL DEFAULT 'Thank you for shopping at Lee.',
    "paper_width_mm" INTEGER NOT NULL DEFAULT 80,
    "auto_print" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "shop_settings_pkey" PRIMARY KEY ("branch_id")
);

-- CreateIndex
CREATE INDEX "audit_logs_branch_id_created_at_idx" ON "audit_logs"("branch_id", "created_at");
-- Preserve the branch association of existing product audit records.
UPDATE audit_logs AS audit SET branch_id = stock.branch_id FROM stock_levels AS stock WHERE audit.entity = 'product' AND audit.entity_id = stock.product_id AND audit.branch_id IS NULL;
ALTER TABLE shop_settings ADD CONSTRAINT valid_receipt_width CHECK (paper_width_mm IN (58, 80));
