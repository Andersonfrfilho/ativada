ALTER TABLE "alerts" DROP CONSTRAINT "alerts_side_check";--> statement-breakpoint
ALTER TABLE "alerts" ALTER COLUMN "run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "price_alert_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_price_alert_id_candle_time_unique" ON "alerts" USING btree ("price_alert_id","candle_time") WHERE "alerts"."price_alert_id" is not null;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_price_has_no_run_check" CHECK (("alerts"."side" = 'PRICE') = ("alerts"."run_id" is null));--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_price_alert_id_check" CHECK (("alerts"."side" = 'PRICE') = ("alerts"."price_alert_id" is not null));--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_side_check" CHECK ("alerts"."side" in ('BUY', 'SELL', 'GOAL', 'PRICE'));