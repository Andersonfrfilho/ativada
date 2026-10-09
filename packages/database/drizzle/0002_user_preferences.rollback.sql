-- Desfaz 0002_user_preferences: remove a preferência de alerta pelo Telegram.
ALTER TABLE "users" DROP COLUMN "alert_telegram_enabled";
