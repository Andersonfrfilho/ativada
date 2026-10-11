-- Desfaz 0021: a exclusão lógica da execução.
ALTER TABLE "runs" DROP CONSTRAINT "runs_deleted_is_terminal_check";--> statement-breakpoint
DROP INDEX "runs_user_id_stored_idx";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "deleted_at";
