ALTER TABLE products ADD CONSTRAINT products_price_positive CHECK (price_cents > 0), ADD CONSTRAINT products_tax_valid CHECK (tax_rate BETWEEN 0 AND 10000);
ALTER TABLE stock_levels ADD CONSTRAINT stock_nonnegative CHECK (quantity >= 0);
ALTER TABLE sale_items ADD CONSTRAINT sale_item_quantity_positive CHECK (qty > 0), ADD CONSTRAINT sale_item_money_valid CHECK (unit_price_cents > 0 AND tax_cents >= 0 AND discount_cents >= 0);
ALTER TABLE sales ADD CONSTRAINT sale_totals_valid CHECK (subtotal_cents >= 0 AND tax_cents >= 0 AND discount_cents >= 0 AND total_cents > 0 AND total_cents = subtotal_cents - discount_cents + tax_cents);
ALTER TABLE payments ADD CONSTRAINT payment_amount_valid CHECK (amount_cents > 0 AND tendered_cents >= amount_cents), ADD CONSTRAINT card_reference_required CHECK (method <> 'card' OR (reference IS NOT NULL AND length(trim(reference)) > 0 AND tendered_cents = amount_cents));
