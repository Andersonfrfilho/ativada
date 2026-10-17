// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import { check, type AnyPgColumn, type CheckBuilder } from 'drizzle-orm/pg-core';

import {
  MODEL_TEAM_CONFIDENCE_MAXIMUM,
  MODEL_TEAM_KEYS,
  MODEL_TEAM_PROMPT_VERSIONS,
  MODEL_TEAM_PROVIDERS,
  MODEL_TEAM_RAW_OUTPUT_MAX_LENGTH,
  MODEL_TEAM_REPORT_ACTION,
  MODEL_TEAM_REPORT_KIND,
  MODEL_TEAM_REPORT_STATUS,
  MODEL_TEAM_TIMEFRAMES,
} from '../model-teams/model-team.constant.js';
import { literalList } from './check-literals.js';

export type ReportCheckColumns = Record<
  | 'teamKey'
  | 'provider'
  | 'promptVersion'
  | 'kind'
  | 'timeframe'
  | 'status'
  | 'action'
  | 'confidence'
  | 'rawOutput'
  | 'roles'
  | 'entryPrice'
  | 'targetPrice'
  | 'stopPrice'
  | 'failureCode',
  AnyPgColumn
>;

// As restrições de coerência de model_team_reports (plan D6), separadas do esquema para ele caber no limite de linhas.
function buildValueChecks(table: ReportCheckColumns): readonly CheckBuilder[] {
  return [
    check(
      'model_team_reports_team_key_check',
      sql`${table.teamKey} in (${literalList(MODEL_TEAM_KEYS)})`,
    ),
    check(
      'model_team_reports_provider_check',
      sql`${table.provider} in (${literalList(MODEL_TEAM_PROVIDERS)})`,
    ),
    check(
      'model_team_reports_prompt_version_check',
      sql`${table.promptVersion} in (${literalList(MODEL_TEAM_PROMPT_VERSIONS)})`,
    ),
    check(
      'model_team_reports_kind_check',
      sql`${table.kind} in (${literalList(Object.values(MODEL_TEAM_REPORT_KIND))})`,
    ),
    check(
      'model_team_reports_timeframe_check',
      sql`${table.timeframe} in (${literalList(MODEL_TEAM_TIMEFRAMES)})`,
    ),
    check(
      'model_team_reports_status_check',
      sql`${table.status} in (${literalList(Object.values(MODEL_TEAM_REPORT_STATUS))})`,
    ),
    check(
      'model_team_reports_action_check',
      sql`${table.action} in (${literalList(Object.values(MODEL_TEAM_REPORT_ACTION))})`,
    ),
  ];
}

function buildCoherenceChecks(table: ReportCheckColumns): readonly CheckBuilder[] {
  return [
    check(
      'model_team_reports_confidence_check',
      sql`${table.confidence} between 0 and ${sql.raw(String(MODEL_TEAM_CONFIDENCE_MAXIMUM))}`,
    ),
    check(
      'model_team_reports_raw_output_check',
      sql`char_length(${table.rawOutput}) <= ${sql.raw(String(MODEL_TEAM_RAW_OUTPUT_MAX_LENGTH))}`,
    ),
    check(
      'model_team_reports_decided_check',
      sql`${table.status} <> 'decided' or (${table.action} is not null and ${table.confidence} is not null and ${table.roles} is not null)`,
    ),
    check(
      'model_team_reports_buy_levels_check',
      sql`${table.action} is distinct from 'buy' or (${table.entryPrice} is not null and ${table.targetPrice} is not null and ${table.stopPrice} is not null and ${table.stopPrice} < ${table.entryPrice} and ${table.entryPrice} < ${table.targetPrice})`,
    ),
    check(
      'model_team_reports_failure_code_check',
      sql`${table.status} not in ('failed', 'skipped') or ${table.failureCode} is not null`,
    ),
  ];
}

export function buildReportChecks(table: ReportCheckColumns): readonly CheckBuilder[] {
  return [...buildValueChecks(table), ...buildCoherenceChecks(table)];
}
