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
export { createAlertRepository } from './alerts/alert.repository.js';
export { ALERT_CHANNEL, ALERT_SIDE, ALERT_STATUS } from './alerts/alert.constant.js';
export { createRunMetricsRepository } from './runs/run-metrics.repository.js';
export type * from './alerts/alerts.public-types.js';
export type {
  CreateRunParams,
  EngineCheckpoint,
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
  WalkForwardWindowInput,
} from './run-results/run-result.types.js';
export {
  WALK_FORWARD_WINDOW_STATUS,
  type WalkForwardWindowStatus,
} from './run-results/run-result.constant.js';
export { createRunBatchRepository } from './run-results/run-batch.repository.js';
export type {
  BatchCheckpointParams,
  RunBatchRepository,
  RunBatchWriter,
  RunResultRows,
} from './run-results/run-batch.types.js';
export { resolveRunOwnerScope } from './runs/run-owner.js';
export { RUN_EVENT_KIND } from './run-events/run-event.constant.js';
export { createRunEventListener } from './run-events/run-event-listener.js';
export type * from './run-events/run-events.public-types.js';
export { createRunQueueRepository } from './run-queue/run-queue.repository.js';
export {
  RUN_ORPHAN_POLICY,
  RUN_ORPHANED_ERROR_CODE,
  type RunOrphanPolicy,
} from './run-queue/run-queue.constant.js';
export type { UserRunLimits } from './run-queue/run-limits.js';
export type {
  ClaimedRun,
  ClaimNextRunParams,
  ReclaimExpiredRunsParams,
  ReclaimResult,
  RenewHeartbeatParams,
  RenewHeartbeatResult,
  RunQueuePosition,
  RunQueueRepository,
  RunQueueSummary,
} from './run-queue/run-queue.types.js';
export { createLiveRunRepository } from './live-runs/live-run.repository.js';
export type * from './live-runs/live-run.types.js';
export { createStrategyRepository } from './strategies/strategy.repository.js';
export { EXAMPLE_SEED_OUTCOME, type ExampleSeedOutcome } from './strategies/strategy.constant.js';
export type {
  AddStrategyVersionParams,
  AddStrategyVersionResult,
  CreateStrategyParams,
  CreateStrategyWithVersionParams,
  CreateStrategyWithVersionResult,
  ListStrategiesParams,
  ListVersionsParams,
  SeedExampleStrategyParams,
  StrategiesPage,
  StrategyCursor,
  StrategyRecord,
  StrategyRepository,
  StrategyVersionRecord,
  VersionsPage,
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
export { LINK_OUTCOME } from './telegram/telegram-link.constant.js';
export { createTelegramLinkConsumer } from './telegram/telegram-link-consumer.js';
export { createTelegramLinkRepository } from './telegram/telegram-link.repository.js';
export type * from './telegram/telegram.public-types.js';
export {
  isDatabaseError,
  isForeignKeyViolation,
  readPostgresErrorCode,
} from './postgres-error-code.js';
