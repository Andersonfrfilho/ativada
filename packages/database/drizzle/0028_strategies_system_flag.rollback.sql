-- Desfaz 0028: a estratégia fixa do sistema (spec 015) deixa de ser marcada e volta a aparecer como estratégia comum do usuário.
DROP INDEX "strategies_user_id_system_unique";
ALTER TABLE "strategies" DROP COLUMN "is_system";
