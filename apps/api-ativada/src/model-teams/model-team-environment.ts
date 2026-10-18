// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

const ON_DEMAND_EXPECTATION = 'inteiro entre 0 e 100 (0 desliga o pedido avulso)';
const MAX_ON_DEMAND_PER_DAY = 100;
const DEFAULT_ON_DEMAND_PER_DAY = 20;

// Equipes de modelo (spec 015, plan D8): a API só limita o pedido avulso. Chave, modelo, preço e teto de custo são do worker.
export const modelTeamEnvironmentShape = {
  MODEL_TEAM_ON_DEMAND_PER_USER_PER_DAY: z.coerce
    .number({ error: ON_DEMAND_EXPECTATION })
    .int({ error: ON_DEMAND_EXPECTATION })
    .min(0, { error: ON_DEMAND_EXPECTATION })
    .max(MAX_ON_DEMAND_PER_DAY, { error: ON_DEMAND_EXPECTATION })
    .default(DEFAULT_ON_DEMAND_PER_DAY),
};
