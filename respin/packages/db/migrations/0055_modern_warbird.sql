ALTER TABLE "stripe_finance_extracts" DROP CONSTRAINT "stripe_finance_extracts_currency_usd";--> statement-breakpoint
ALTER TABLE "stripe_finance_extracts" DROP CONSTRAINT "stripe_finance_extracts_amounts_nonnegative";--> statement-breakpoint
ALTER TABLE "stripe_finance_extracts" ALTER COLUMN "currency" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "stripe_finance_extracts" ALTER COLUMN "currency" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_finance_extracts" ADD COLUMN "amount_including_tax_cents" integer;--> statement-breakpoint
ALTER TABLE "stripe_finance_extracts" ADD CONSTRAINT "stripe_finance_extracts_currency_shape" CHECK ("stripe_finance_extracts"."status" <> 'complete' OR "stripe_finance_extracts"."currency" = 'USD');--> statement-breakpoint
ALTER TABLE "stripe_finance_extracts" ADD CONSTRAINT "stripe_finance_extracts_amounts_shape" CHECK (("stripe_finance_extracts"."disputed_amount_cents" IS NULL OR "stripe_finance_extracts"."disputed_amount_cents" >= 0)
          AND NOT ("stripe_finance_extracts"."amount_excluding_tax_cents" IS NOT NULL AND "stripe_finance_extracts"."amount_including_tax_cents" IS NOT NULL));