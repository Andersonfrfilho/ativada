-- Desfaz 0023: a coluna `stalled_since` e os avisos de parada e de volta da caixa de saída (lados STALL e RESUME), que só existem por causa dela.
DELETE FROM "alerts" WHERE "side" IN ('STALL', 'RESUME');--> statement-breakpoint
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_side_check";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "stalled_since";--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_side_check" CHECK ("alerts"."side" in ('BUY', 'SELL', 'GOAL', 'PRICE'));
