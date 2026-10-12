// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MILLISECONDS_PER_MINUTE } from './live72.constant.js';
import type { EventSummary } from './live72-events.js';
import type { RunCounts } from './run-counts.js';
import type { RunFile } from './run-file.js';

const NOT_AVAILABLE = 'n/d';
const KILOBYTES_PER_GIGABYTE = 1024 * 1024;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const PID_PATTERN = /^\d+$/;

export type ProcessState = {
  readonly name: string;
  readonly pid: number | null;
  readonly isAlive: boolean;
};

export type StatusFacts = {
  readonly now: number;
  readonly run: RunFile | undefined;
  readonly runStatus: string | null;
  readonly isWaitingForData: boolean;
  readonly counts: RunCounts | null;
  readonly evaluatedCandles: number | null;
  readonly equity: string | null;
  readonly openPosition: string | null;
  readonly alertsByStatus: Readonly<Record<string, number>>;
  readonly events: EventSummary | null;
  readonly processes: readonly ProcessState[];
  readonly isApiHealthy: boolean;
  readonly tickerAgeSeconds: number | null;
  readonly databaseBytes: number | null;
  readonly diskFreeKilobytes: number | null;
};

// O conteúdo do arquivo de pid é um inteiro e nada mais: qualquer outra coisa é arquivo corrompido.
export function parsePid(text: string): number | null {
  const trimmed = text.trim();
  return PID_PATTERN.test(trimmed) ? Number(trimmed) : null;
}

// Saída de `df -k <caminho>`: a coluna "Available" (4ª) da última linha, em KB.
export function parseDfAvailableKilobytes(output: string): number | null {
  const lines = output.trim().split('\n');
  const columns = (lines.at(-1) ?? '').trim().split(/\s+/);
  const available = Number(columns[3]);
  return lines.length >= 2 && Number.isFinite(available) ? available : null;
}

export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / MILLISECONDS_PER_MINUTE));
  const hours = Math.floor(totalMinutes / 60);
  return `${hours} h ${String(totalMinutes % 60).padStart(2, '0')} min`;
}

function formatElapsed(facts: StatusFacts): string {
  const { run } = facts;
  if (run === undefined) return 'simulação ainda não iniciada (make live72-start)';
  const started = Date.parse(run.startedAt);
  const remaining = Date.parse(run.plannedEndAt) - facts.now;
  const left = remaining > 0 ? `faltam ${formatDuration(remaining)}` : 'prazo de 72 h cumprido';
  return `${formatDuration(facts.now - started)} desde ${run.startedAt} (${left}; término previsto ${run.plannedEndAt})`;
}

function formatCandles(facts: StatusFacts): string {
  const { counts } = facts;
  if (counts === null) return NOT_AVAILABLE;
  const last =
    counts.lastCandleTime === null ? 'nenhum' : new Date(counts.lastCandleTime).toISOString();
  return `${facts.evaluatedCandles ?? NOT_AVAILABLE} avaliados; último candle ${last}`;
}

function formatProcesses(processes: readonly ProcessState[]): string {
  return processes
    .map((entry) => `${entry.name} ${entry.isAlive ? `ok (pid ${entry.pid ?? '?'})` : 'PARADO'}`)
    .join(', ');
}

function formatEvents(events: EventSummary | null): string {
  if (events === null) return NOT_AVAILABLE;
  const exits = Object.entries(events.childExits).map(([name, total]) => `${name} ${total}`);
  const kill =
    events.controlledKill === undefined ? 'ainda não' : `feito em ${events.controlledKill.at}`;
  return `supervisor iniciado ${events.supervisorStarts}x; saídas de processo: ${exits.join(', ') || 'nenhuma'}; reinício controlado do worker: ${kill}; comandos humanos: ${events.interventions.length}`;
}

function formatDisk(facts: StatusFacts): string {
  const database =
    facts.databaseBytes === null
      ? NOT_AVAILABLE
      : `${(facts.databaseBytes / BYTES_PER_MEGABYTE).toFixed(0)} MB`;
  const free =
    facts.diskFreeKilobytes === null
      ? NOT_AVAILABLE
      : `${(facts.diskFreeKilobytes / KILOBYTES_PER_GIGABYTE).toFixed(1)} GB livres`;
  return `banco ${database}; disco ${free}`;
}

function formatTicker(age: number | null): string {
  return age === null ? 'sem tick recebido na sonda' : `último tick há ${age.toFixed(1)} s`;
}

export function formatStatus(facts: StatusFacts): string {
  const { counts } = facts;
  const alerts = JSON.stringify(facts.alertsByStatus);
  return [
    `Tempo: ${formatElapsed(facts)}`,
    `Execução: ${facts.runStatus ?? NOT_AVAILABLE}; esperando dados (waitingForData): ${facts.isWaitingForData ? 'sim' : 'não'}`,
    `Candles: ${formatCandles(facts)}`,
    `Sinais ${counts?.signals ?? NOT_AVAILABLE}; ordens ${counts?.orders ?? NOT_AVAILABLE}; preenchimentos ${counts?.fills ?? NOT_AVAILABLE}`,
    `Posição: ${facts.openPosition ?? 'sem posição aberta'}; patrimônio ${facts.equity ?? NOT_AVAILABLE}`,
    `Alertas gerados ${counts?.alerts ?? NOT_AVAILABLE} (caixa de saída: ${alerts})`,
    `Supervisor: ${formatEvents(facts.events)}`,
    `Processos: ${formatProcesses(facts.processes)}; API ${facts.isApiHealthy ? 'responde' : 'NÃO responde'}`,
    `Ticker: ${formatTicker(facts.tickerAgeSeconds)}`,
    `Espaço: ${formatDisk(facts)}`,
    '',
  ].join('\n');
}
