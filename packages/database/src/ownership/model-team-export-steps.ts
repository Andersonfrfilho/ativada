// Copyright (c) 2026 Ada Technology. All rights reserved.
import { teamRunInputs } from '../schema/team-run-inputs.schema.js';
import { userModelTeams } from '../schema/user-model-teams.schema.js';
import type { OwnedTableExportStep } from './owned-table-exports.js';

// O interruptor das equipes e a entrada gravada da execução de equipe (spec 015): do dono, exportadas por inteiro.
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
];
