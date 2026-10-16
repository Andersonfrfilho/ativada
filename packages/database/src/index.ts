// Copyright (c) 2026 Ada Technology. All rights reserved.
// Superfície pública de @ativada/database: só o que as apps podem usar (ADR 0001 §c e §e).
export { parseAccountId, type AccountId } from './admin/admin-account-id.js';
export {
  createAdminAccountRepository,
  type AdminAccountRepository,
} from './admin/admin-account.repository.js';
export type * from './admin/admin-account.types.js';
export {
  createAccountDeletionRepository,
  type AccountDeletionRepository,
} from './account/account-deletion.repository.js';
export {
  createAccountPurgeRepository,
  type AccountPurgeRepository,
} from './account/account-purge.repository.js';
export type * from './account/account-purge.types.js';
export {
  createAccountExportRepository,
  type AccountExportRepository,
} from './account/account-export.repository.js';
export type * from './account/account-export.types.js';
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
  StorageQuotaReachedError,
  STORAGE_QUOTA_RESOURCE,
  type StorageQuotaResource,
} from './quota/storage-quota.error.js';
export {
  closeDatabase,
  openDatabase,
  pingDatabase,
  readDatabaseHealth,
  type DatabaseHandle,
} from './database-handle.js';
export {
  createDatabaseOutageGuard,
  DatabaseUnavailableError,
  isDatabaseConnectionFailure,
} from './connection/public.js';
export { CLOCK_SKEW_TOLERANCE_MILLISECONDS } from './candles/candle.constant.js';
export { createCandleRepository } from './candles/candle.repository.js';
export type * from './candles/candle.types.js';
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
export { RUN_DELETE_OUTCOME, type RunDeleteOutcome } from './runs/run.types.js';
export type { RunKind, RunStatus } from './runs/run.constant.js';
export { createRunRepository } from './runs/run.repository.js';
export { createGoalRepository } from './goals/goal.repository.js';
export {
  GOAL_CREATE_OUTCOME,
  GOAL_DELETE_OUTCOME,
  GOAL_RUN_OUTCOME,
} from './goals/goal.constant.js';
export type { GoalRunOutcome } from './goals/goal.constant.js';
export type * from './goals/goal.types.js';
export { createAlertRepository } from './alerts/alert.repository.js';
export { ALERT_CHANNEL, ALERT_SIDE, ALERT_STATUS } from './alerts/alert.constant.js';
export { createRunMetricsRepository } from './runs/run-metrics.repository.js';
export type * from './alerts/alerts.public-types.js';
export type * from './runs/run.types.js';
export type { DataWaitState, RecordDataWaitParams } from './runs/run-data-wait.js';
export { createRunResultRepository } from './run-results/run-result.repository.js';
export { RESULT_ORDER } from './run-results/run-result.types.js';
export type * from './run-results/run-result.types.js';
export {
  POSITION_STATUS,
  WALK_FORWARD_WINDOW_STATUS,
  type PositionStatus,
  type WalkForwardWindowStatus,
} from './run-results/run-result.constant.js';
export type {
  FillClusterBucket,
  FillClustersParams,
  FillCounts,
  FillMarkerInput,
  FillMarkersParams,
  PriceColumn,
  PriceColumnsParams,
  TradeTotals,
} from './run-results/run-chart.types.js';
export type { RunLogCursor, RunLogEntry } from './run-results/run-log.types.js';
export { createRunLiveStatusRepository } from './run-results/run-live-status.js';
export type * from './run-results/run-live-status.types.js';
export { createRunProjectionRepository } from './run-results/run-projections.js';
export type * from './run-results/run-projections.types.js';
export { createRunBatchRepository } from './run-results/run-batch.repository.js';
export type * from './run-results/run-batch.types.js';
export { resolveRunOwnerScope } from './runs/run-owner.js';
export { PRICE_ALERT_EVENT_KIND, RUN_EVENT_KIND } from './run-events/run-event.constant.js';
export { createRunEventListener } from './run-events/run-event-listener.js';
export { isFatalSessionEnd } from './notifications/session-end.js';
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
export type * from './strategies/strategy.types.js';
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
export { createPriceAlertRepository } from './price-alerts/price-alert.repository.js';
export { createPriceAlertEvaluationRepository } from './price-alerts/price-alert-evaluation.repository.js';
export {
  PRICE_ALERT_CREATE_OUTCOME,
  PRICE_ALERT_DIRECTION,
  PRICE_ALERT_ORIGIN,
  PRICE_ALERT_UPDATE_OUTCOME,
  type PriceAlertDirection,
  type PriceAlertOrigin,
} from './price-alerts/price-alert.constant.js';
export type * from './price-alerts/price-alert.types.js';
export type {
  FireDueAlertsParams,
  FireDueAlertsResult,
  PriceAlertEvaluationRepository,
} from './price-alerts/price-alert-evaluation.repository.js';
export { createUserAssetRepository } from './user-assets/user-asset.repository.js';
export {
  USER_ASSET_DECISION_KIND,
  USER_ASSET_MUTATE_OUTCOME,
} from './user-assets/user-asset.constant.js';
export type * from './user-assets/user-asset.types.js';
export { createWorkerHeartbeatRepository } from './worker-heartbeats/worker-heartbeat.repository.js';
export type * from './worker-heartbeats/worker-heartbeat.types.js';
export { createRunStallRepository } from './run-stall/run-stall.repository.js';
export type * from './run-stall/run-stall.types.js';
export { createAnalystDecisionRepository } from './analyst/analyst-decision.repository.js';
export type * from './analyst/analyst-decision.types.js';
