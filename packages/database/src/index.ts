// Copyright (c) 2026 Ada Technology. All rights reserved.
// Superfície pública de @cryptoada/database: só o que as apps podem usar (ADR 0001 §c e §e).
export { parseAccountId, type AccountId } from './admin/admin-account-id.js';
export {
  createAdminAccountRepository,
  type AdminAccountRepository,
} from './admin/admin-account.repository.js';
export type {
  AccountPage,
  AccountPageCursor,
  AdminAccountRecord,
  ListAccountsParams,
} from './admin/admin-account.types.js';
export {
  createAccountDeletionRepository,
  type AccountDeletionRepository,
} from './account/account-deletion.repository.js';
export {
  createAccountPurgeRepository,
  type AccountPurgeRepository,
} from './account/account-purge.repository.js';
export type {
  ListPendingAccountsParams,
  PendingAccount,
  PendingAccountCursor,
  PendingAccountsPage,
  RemoveUserRowParams,
} from './account/account-purge.types.js';
export {
  createAccountExportRepository,
  type AccountExportRepository,
} from './account/account-export.repository.js';
export type {
  AccountExport,
  AccountExportAuditEvents,
  ExportRow,
} from './account/account-export.types.js';
export {
  createBlockedAccountRepository,
  type BlockedAccount,
  type BlockedAccountRepository,
  type BlockedAccountsPage,
  type ListBlockedAccountsParams,
} from './account/blocked-account.repository.js';
export {
  createAuditRetentionRepository,
  type AuditRetentionRepository,
} from './audit/audit-retention.repository.js';
export { AUDIT_ACTOR_KIND, type AuditActorKind } from './audit/audit-event.constant.js';
export {
  createAuditEventRepository,
  type AuditEventInput,
  type AuditEventRepository,
} from './audit/audit-event.repository.js';
export {
  closeDatabase,
  openDatabase,
  pingDatabase,
  type DatabaseHandle,
} from './database-handle.js';
export { CLOCK_SKEW_TOLERANCE_MILLISECONDS } from './candles/candle.constant.js';
export { createCandleRepository } from './candles/candle.repository.js';
export type {
  CandleRecord,
  CandleRepository,
  CandleRepositoryOptions,
  CandleSeriesKey,
  CandleTimeframe,
  FindCandlesParams,
  FindMissingOpenTimesParams,
  UpsertCandlesResult,
} from './candles/candle.types.js';
export { OpenCandleRejectedError } from './candles/open-candle-rejected.error.js';
export { createSentimentRepository } from './sentiment/sentiment.repository.js';
export type {
  FearGreedEntry,
  FindFearGreedParams,
  SentimentRepository,
} from './sentiment/sentiment.types.js';
export { createSentimentObservationRepository } from './sentiment/sentiment-observation.repository.js';
export type {
  AppendObservationsResult,
  FindAvailableObservationParams,
  SentimentObservationInput,
  SentimentObservationRecord,
  SentimentObservationRepository,
} from './sentiment/sentiment-observation.types.js';
export type { JsonContainer, JsonValue } from './json-value.types.js';
export { RUN_KIND, RUN_STATUS, RUN_TRANSITION_OUTCOME } from './runs/run.constant.js';
export type { RunKind, RunStatus } from './runs/run.constant.js';
export { createRunRepository } from './runs/run.repository.js';
export type {
  CreateRunParams,
  EngineCheckpoint,
  FailOrphanedRunsParams,
  ListRunsParams,
  RunCursor,
  RunRecord,
  RunRepository,
  RunsPage,
  SaveCheckpointParams,
  TransitionRunParams,
  TransitionRunResult,
} from './runs/run.types.js';
export { createRunResultRepository } from './run-results/run-result.repository.js';
export type {
  AppendResult,
  CommandInput,
  EquityPointInput,
  FillCursor,
  FillInput,
  ListResultsParams,
  OrderCursor,
  OrderInput,
  PositionCursor,
  PositionInput,
  ResultPage,
  RunResultRepository,
  SignalInput,
} from './run-results/run-result.types.js';
export { createStrategyRepository } from './strategies/strategy.repository.js';
export type {
  AddStrategyVersionParams,
  AddStrategyVersionResult,
  CreateStrategyParams,
  StrategyRecord,
  StrategyRepository,
  StrategyVersionRecord,
} from './strategies/strategy.types.js';
export { InvalidUserIdError } from './ownership/invalid-user-id.error.js';
export type { OwnerScope } from './ownership/owner-scope.js';
export type { UserId } from './ownership/user-id.js';
export { USER_RESOLUTION_STATUS } from './users/user-resolution.constant.js';
export { resolveUserBySubject, type UserResolution } from './users/resolve-user-by-subject.js';
export {
  DISPLAY_CURRENCY,
  DISPLAY_NAME_MAX_LENGTH,
  TIMEZONE_MAX_LENGTH,
  type DisplayCurrency,
} from './users/display-currency.constant.js';
export { createProfileRepository, type ProfileRepository } from './users/profile.repository.js';
export type { ProfilePatch, ProfileRecord } from './users/profile.types.js';
export { LINK_OUTCOME, type LinkOutcome } from './telegram/telegram-link.constant.js';
export {
  createTelegramLinkConsumer,
  type ConsumeLinkCodeParams,
  type TelegramLinkConsumer,
} from './telegram/telegram-link-consumer.js';
export {
  createTelegramLinkRepository,
  type IssueLinkCodeParams,
  type TelegramLinkRepository,
} from './telegram/telegram-link.repository.js';
export { isDatabaseError, readPostgresErrorCode } from './postgres-error-code.js';
