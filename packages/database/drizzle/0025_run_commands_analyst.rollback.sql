-- Desfaz 0025: volta o CHECK de run_commands.reason sem analyst_timeout (spec 007).
-- Nunca apaga trilha: com qualquer linha de motivo do analista gravada, o rollback ABORTA e nada muda.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "run_commands" WHERE "reason" LIKE 'analyst\_%') THEN
    RAISE EXCEPTION 'run_commands tem linhas com motivo do analista: o rollback da 0025 não apaga trilha'
      USING ERRCODE = 'restrict_violation';
  END IF;
END
$$;
ALTER TABLE "run_commands" DROP CONSTRAINT "run_commands_reason_check";
ALTER TABLE "run_commands" ADD CONSTRAINT "run_commands_reason_check" CHECK ("run_commands"."reason" in ('goal_reached', 'goal_max_loss', 'goal_expired', 'user_stop', 'kill_switch', 'window_end', 'user_resume')) NOT VALID;
ALTER TABLE "run_commands" VALIDATE CONSTRAINT "run_commands_reason_check";
