-- Desfaz 0029: volta o CHECK de candles.timeframe sem 1m (spec 017).
-- O rollback não apaga nada sozinho: com qualquer linha 1m gravada ele ABORTA e nada muda
-- (apague as velas de exibição de propósito, com a rotina de limpeza, e rode de novo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "candles" WHERE "timeframe" = '1m') THEN
    RAISE EXCEPTION 'candles tem linhas de 1m: o rollback da 0029 não apaga velas de exibição'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$$;
ALTER TABLE "candles" DROP CONSTRAINT "candles_timeframe_check";
ALTER TABLE "candles" ADD CONSTRAINT "candles_timeframe_check" CHECK ("candles"."timeframe" in ('15m', '1h', '4h', '1d', '3m')) NOT VALID;
ALTER TABLE "candles" VALIDATE CONSTRAINT "candles_timeframe_check";
