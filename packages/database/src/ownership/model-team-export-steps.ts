// Copyright (c) 2026 Ada Technology. All rights reserved.
import { modelTeamQuestions } from '../schema/model-team-questions.schema.js';
import { teamRunInputs } from '../schema/team-run-inputs.schema.js';
import { userModelTeams } from '../schema/user-model-teams.schema.js';
import type { OwnedTableExportStep } from './owned-table-exports.js';

// O interruptor das equipes, a entrada gravada da execução de equipe e as perguntas livres (spec 015): do dono. A pergunta sai
// com a resposta e o custo; o arrendamento e os tokens (técnicos) ficam de fora.
export const MODEL_TEAM_EXPORT_STEPS: readonly OwnedTableExportStep[] = [
  {
    table: teamRunInputs,
    mode: 'columns',
    columns: ['runId', 'candleTime', 'reportId', 'failureCode', 'appliedAction', 'createdAt'],
  },
  {
    table: userModelTeams,
    mode: 'columns',
    columns: ['teamKey', 'isEnabled', 'onDemandDay', 'onDemandCount', 'updatedAt'],
  },
  {
    table: modelTeamQuestions,
    mode: 'columns',
    columns: [
      'id',
      'runId',
      'teamKey',
      'symbol',
      'question',
      'status',
      'answer',
      'failureCode',
      'costUsd',
      'requestedAt',
      'decidedAt',
    ],
  },
];
