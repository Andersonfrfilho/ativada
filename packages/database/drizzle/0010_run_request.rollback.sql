-- Desfaz 0010: o pedido da execução (grade e janelas do walk-forward) deixa de morar na linha.
ALTER TABLE "runs" DROP COLUMN "request";
