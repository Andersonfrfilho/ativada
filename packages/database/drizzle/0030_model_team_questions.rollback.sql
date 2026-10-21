-- Desfaz 0030: as perguntas livres às equipes de modelo (adendo da spec 015) se PERDEM, e com elas o custo já gasto que entra
-- no teto do dia e do mês. Por isso ABORTA enquanto existir pergunta pendente (em voo, com reserva de custo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "model_team_questions" WHERE "status" = 'pending') THEN
    RAISE EXCEPTION 'rollback da 0030 não apaga perguntas pendentes às equipes de modelo' USING ERRCODE = 'restrict_violation';
  END IF;
END
$$;
DROP TABLE "model_team_questions";
