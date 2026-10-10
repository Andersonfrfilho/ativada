-- Desfaz 0008: resultados (filhas de runs) e a tabela append-only com o gatilho que a protege.
DROP TABLE "equity_points";
DROP TABLE "run_commands";
DROP TABLE "fills";
DROP TABLE "positions";
DROP TABLE "orders";
DROP TABLE "signals";
DROP TABLE "sentiment_observations";
DROP FUNCTION "sentiment_observations_reject_change"();
