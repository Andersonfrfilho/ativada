-- Desfaz 0027: os relatórios gravados das equipes de modelo (spec 015) se PERDEM, e com eles a reprodução das execuções de equipe.
-- Por isso ABORTA enquanto existir execução com `signalSource` de equipe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM runs WHERE request -> 'signalSource' IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback da 0027 não apaga relatórios enquanto houver execução de equipe de modelo' USING ERRCODE = 'restrict_violation';
  END IF;
END
$$;
DROP TABLE "team_run_inputs";
DROP TABLE "user_model_teams";
DROP TABLE "model_team_reports";
ALTER TABLE "worker_heartbeats" DROP COLUMN "model_teams";
