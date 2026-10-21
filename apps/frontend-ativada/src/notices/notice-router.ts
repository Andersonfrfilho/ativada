// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SUMMARY_AWAY_MILLISECONDS } from './notice.constant.js';
import type { Notice } from './notice.validation.js';
import {
  decideEffects,
  diffNotices,
  snapshotStates,
  summarizeChanges,
  type EventContext,
  type NoticeChange,
} from './notice-events.js';

export type RouterSink = {
  readonly toast: (notice: Notice) => void;
  readonly sound: (notice: Notice) => void;
  readonly notify: (notice: Notice) => void;
  readonly announce: (notice: Notice) => void;
  readonly summary: (text: string) => void;
};

export type RouterOptions = {
  readonly sink: RouterSink;
  readonly getContext: () => EventContext;
  readonly now: () => number;
  // Quanto o resumo espera por mais mudanças antes de falar (as duas listas chegam em momentos diferentes).
  readonly summaryDelayMilliseconds: number;
  // Por quanto tempo, depois de religar, as mudanças viram resumo em vez de aviso individual.
  readonly awayWindowMilliseconds: number;
};

type States = ReadonlyMap<string, Notice['state']>;

// Decide, por mudança, o que a pessoa vê, ouve e recebe; é puro de React para os contratos não dependerem da tela.
export class NoticeEventRouter {
  private readonly known = new Map<string, States>();
  private bucket: NoticeChange[] = [];
  private summaryUntil = 0;
  private hiddenSince: number | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: RouterOptions) {}

  // A primeira leitura de cada assunto é só a linha de base (nada vira toast); depois, o que mudou.
  readonly ingest = (source: string, notices: readonly Notice[]): void => {
    const previous = this.known.get(source);
    this.known.set(source, new Map([...(previous ?? []), ...snapshotStates(notices)]));
    if (previous === undefined) return;
    const changes = diffNotices(previous, notices);
    if (changes.length > 0) this.route(changes);
  };

  // O socket voltou depois de cair: o que chegar nos próximos instantes vira UM resumo, sem som.
  readonly beginAway = (): void => {
    this.summaryUntil = this.options.now() + this.options.awayWindowMilliseconds;
  };

  readonly setHidden = (isHidden: boolean): void => {
    if (isHidden) {
      this.hiddenSince ??= this.options.now();
      return;
    }
    const away = this.hiddenSince === undefined ? 0 : this.options.now() - this.hiddenSince;
    this.hiddenSince = undefined;
    if (away > SUMMARY_AWAY_MILLISECONDS) this.flushSummary();
    else this.replayBucket();
  };

  readonly stop = (): void => {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  };

  private route(changes: readonly NoticeChange[]): void {
    if (this.hiddenSince !== undefined) {
      this.bucket.push(...changes);
      for (const change of changes) this.fire(change, true);
      return;
    }
    if (this.options.now() < this.summaryUntil) {
      this.bucket.push(...changes);
      this.scheduleSummary();
      return;
    }
    for (const change of changes) this.fire(change, false);
  }

  private fire(change: NoticeChange, isHidden: boolean): void {
    const effects = decideEffects(change.notice, {
      ...this.options.getContext(),
      isTabHidden: isHidden,
    });
    const { sink } = this.options;
    if (effects.isBrowserNotification) sink.notify(change.notice);
    if (isHidden) return;
    if (effects.isToast) sink.toast(change.notice);
    if (effects.isSound) sink.sound(change.notice);
    if (effects.isAnnounced) sink.announce(change.notice);
  }

  private replayBucket(): void {
    const pending = this.bucket;
    this.bucket = [];
    for (const change of pending) this.fire(change, false);
  }

  private scheduleSummary(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(this.flushSummary, this.options.summaryDelayMilliseconds);
  }

  private readonly flushSummary = (): void => {
    this.timer = undefined;
    const pending = this.bucket.filter(
      (change) =>
        decideEffects(change.notice, { ...this.options.getContext(), isTabHidden: false }).isToast,
    );
    this.bucket = [];
    const text = summarizeChanges(pending);
    if (text !== undefined) this.options.sink.summary(text);
  };
}
