-- Spec 017 (ADR 0002, "Gráfico em velas menores"): candles aceita a vela de exibição 3m (retenção curta, nunca timeframe de execução).
-- NOT VALID + VALIDATE: a troca do CHECK não reescreve a tabela e a validação das linhas antigas é feita à parte.
ALTER TABLE "candles" DROP CONSTRAINT "candles_timeframe_check";--> statement-breakpoint
ALTER TABLE "candles" ADD CONSTRAINT "candles_timeframe_check" CHECK ("candles"."timeframe" in ('15m', '1h', '4h', '1d', '3m')) NOT VALID;--> statement-breakpoint
ALTER TABLE "candles" VALIDATE CONSTRAINT "candles_timeframe_check";
