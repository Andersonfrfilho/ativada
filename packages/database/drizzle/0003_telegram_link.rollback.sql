-- Desfaz 0003_telegram_link: remove os códigos de vínculo e a unicidade do chat.
DROP TABLE "telegram_link_codes";
--> statement-breakpoint
DROP INDEX "users_telegram_chat_id_unique";
