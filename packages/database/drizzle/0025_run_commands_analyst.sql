-- Spec 007 (ADR 0002 A21): o motivo analyst_timeout (saída por tempo do analista) passa a valer em run_commands.
-- NOT VALID + VALIDATE: a troca do CHECK não reescreve a tabela e a validação das linhas antigas é feita à parte.
ALTER TABLE "run_commands" DROP CONSTRAINT "run_commands_reason_check";--> statement-breakpoint
ALTER TABLE "run_commands" ADD CONSTRAINT "run_commands_reason_check" CHECK ("run_commands"."reason" in ('goal_reached', 'goal_max_loss', 'goal_expired', 'user_stop', 'kill_switch', 'window_end', 'user_resume', 'analyst_timeout')) NOT VALID;--> statement-breakpoint
ALTER TABLE "run_commands" VALIDATE CONSTRAINT "run_commands_reason_check";
