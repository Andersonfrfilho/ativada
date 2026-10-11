-- Desfaz 0018: o aviso do alerta de preço na caixa de saída (lado PRICE, coluna, índice e CHECKs) e volta `run_id` a NOT NULL.
DELETE FROM "alerts" WHERE "side" = 'PRICE';--> statement-breakpoint
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_side_check";--> statement-breakpoint
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_price_alert_id_check";--> statement-breakpoint
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_price_has_no_run_check";--> statement-breakpoint
DROP INDEX "alerts_price_alert_id_candle_time_unique";--> statement-breakpoint
ALTER TABLE "alerts" DROP COLUMN "price_alert_id";--> statement-breakpoint
ALTER TABLE "alerts" ALTER COLUMN "run_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_side_check" CHECK ("alerts"."side" in ('BUY', 'SELL', 'GOAL'));
