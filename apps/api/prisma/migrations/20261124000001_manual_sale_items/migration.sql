-- Manual receipt lines have no catalog product and do not affect inventory.
ALTER TABLE "sale_items" ALTER COLUMN "product_id" DROP NOT NULL;
