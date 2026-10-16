-- Desfaz 0026: volta o CHECK de candles.timeframe sem 3m (spec 017).
-- Velas de exibição são dado público e descartável, mas o rollback não apaga nada sozinho: com qualquer linha 3m
-- gravada ele ABORTA e nada muda (apague as velas de exibição de propósito, com a rotina de limpeza, e rode de novo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "candles" WHERE "timeframe" = '3m') THEN
    RAISE EXCEPTION 'candles tem linhas de 3m: o rollback da 0026 não apaga velas de exibição'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$$;
ALTER TABLE "candles" DROP CONSTRAINT "candles_timeframe_check";
ALTER TABLE "candles" ADD CONSTRAINT "candles_timeframe_check" CHECK ("candles"."timeframe" in ('15m', '1h', '4h', '1d')) NOT VALID;
ALTER TABLE "candles" VALIDATE CONSTRAINT "candles_timeframe_check";
