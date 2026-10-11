-- Desfaz 0020: o carimbo do último disparo do alerta de preço.
ALTER TABLE "price_alerts" DROP COLUMN "last_fired_at";
