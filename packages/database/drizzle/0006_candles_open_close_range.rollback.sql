-- Desfaz 0006: só remove a restrição; os dados da tabela candles ficam como estão.
ALTER TABLE "candles" DROP CONSTRAINT "candles_open_close_within_range_check";
