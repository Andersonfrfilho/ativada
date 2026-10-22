// Copyright (c) 2026 Ada Technology. All rights reserved.
// Tudo o que as equipes de modelo (spec 015) expõem ao resto do monorepo, num lugar só.
export { createTeamReportRepository } from './team-report.repository.js';
export { createUserModelTeamRepository } from './user-model-team.repository.js';
export { createTeamRunInputRepository } from './team-run-input.repository.js';
export { createModelTeamReadRepository } from './model-team-read.repository.js';
export { createTeamQuestionRepository } from './team-question.repository.js';
export { createTeamQuestionQueueRepository } from './team-question-queue.repository.js';
export type * from './team-question.types.js';
export {
  createModelDuelRepository,
  MODEL_DUEL_CURVE_MAXIMUM_POINTS,
} from './model-duel.repository.js';
export type * from './model-team-read.types.js';
export type * from './team-run-input.types.js';
export type {
  DuelEquityPoint,
  DuelTradeCount,
  ModelDuelRepository,
} from './model-duel.repository.js';
export {
  MODEL_TEAM_REPORT_ACTION,
  MODEL_TEAM_REPORT_KIND,
  MODEL_TEAM_REPORT_STATUS,
  MODEL_TEAM_RETENTION_DAYS,
  MODEL_TEAM_QUESTION_MAX_LENGTH,
  MODEL_TEAM_QUESTION_MIN_LENGTH,
  MODEL_TEAM_QUESTION_RETENTION_DAYS,
  MODEL_TEAM_QUESTION_STATUS,
  type ModelTeamQuestionStatus,
  type ModelTeamReportKind,
  type ModelTeamReportStatus,
} from './model-team.constant.js';
