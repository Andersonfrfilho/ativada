// Copyright (c) 2026 Ada Technology. All rights reserved.
export const AGENT_LABEL = 'com.adatechnology.cryptoada-live72';
export const COMPOSE_PROJECT = 'cryptoada-live72';
export const HOME_DIRECTORY_NAME = '.cryptoada-live72';

export const MILLISECONDS_PER_SECOND = 1_000;
export const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND;
export const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;

export const SIMULATION_HOURS = 72;
export const CONTROLLED_KILL_HOURS = 36;
export const CANDLE_MILLISECONDS = MILLISECONDS_PER_HOUR;

export const RUN_SETUP = {
  SYMBOL: 'BTCUSDT',
  TIMEFRAME: '1h',
  INITIAL_BALANCE: '10000',
  GOAL_TARGET_RATE: '0.5',
  GOAL_MAX_LOSS_RATE: '0.5',
  GOAL_HORIZON_DAYS: 90,
} as const;

export const CHILD_NAME = {
  API: 'api',
  WORKER: 'worker',
  TELEGRAM_SINK: 'telegram-sink',
  CRON: 'cron',
} as const;

export const EVENT_TYPE = {
  SUPERVISOR_START: 'supervisor_start',
  SUPERVISOR_STOP: 'supervisor_stop',
  CHILD_START: 'child_start',
  CHILD_EXIT: 'child_exit',
  CONTROLLED_WORKER_KILL: 'controlled_worker_kill',
  CRON_RUN: 'cron_run',
  INFRA_WAIT: 'infra_wait',
  CLI_COMMAND: 'cli_command',
} as const;

export const CLI_COMMAND = {
  UP: 'up',
  START: 'start',
  STATUS: 'status',
  REPORT: 'report',
  STOP: 'stop',
  DOWN: 'down',
} as const;

export type CliCommand = (typeof CLI_COMMAND)[keyof typeof CLI_COMMAND];

export const MUTATING_COMMANDS: readonly CliCommand[] = [
  CLI_COMMAND.UP,
  CLI_COMMAND.START,
  CLI_COMMAND.STOP,
  CLI_COMMAND.DOWN,
];

export const VERDICT = {
  APPROVED: 'APROVADO',
  FAILED: 'REPROVADO',
  INCONCLUSIVE: 'INCONCLUSIVO',
} as const;

export type Verdict = (typeof VERDICT)[keyof typeof VERDICT];

export const SIGNAL_ACTION_HOLD = 'HOLD';
export const RUN_STATUS_RUNNING = 'running';
export const HTTP_OK = 200;
export const HTTP_CREATED = 201;
export const HTTP_ACCEPTED = 202;
export const REQUEST_TIMEOUT_MILLISECONDS = 15_000;
export const JSON_INDENT = 2;
