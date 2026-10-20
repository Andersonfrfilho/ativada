// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { EXTERNAL_LINK_REL } from '../../overview/overview.constant.js';
import { CLASSIFICATION_TEXT } from '../../overview/SentimentCard.component.js';
import { useSentimentQuery } from '../../overview/sentiment.query.js';
import { gaugeArc, gaugeNeedle } from './wall-model.js';
import styles from './Wall.module.css';

const ZONES = [0, 1, 2, 3, 4] as const;
const ZONE_CLASS = [styles.zone0, styles.zone1, styles.zone2, styles.zone3, styles.zone4] as const;

function Gauge({ value }: { readonly value: number }): ReactElement {
  const needle = gaugeNeedle(value);
  return (
    <svg viewBox="0 0 120 64" aria-hidden="true" focusable="false">
      {ZONES.map((zone) => (
        <path key={zone} d={gaugeArc(zone)} className={ZONE_CLASS[zone]} />
      ))}
      <line x1={60} y1={56} x2={needle.x} y2={needle.y} className={styles.needle} />
      <circle cx={60} cy={56} r={4} className={styles.needleHub} />
    </svg>
  );
}

// O Fear & Greed da consulta de sentimento que o painel já faz, sempre com o crédito da fonte.
export function FearGreedScreen(): ReactElement {
  const data = useSentimentQuery().data;
  const classification = data?.classification ?? undefined;
  const word =
    classification === undefined ? '' : (CLASSIFICATION_TEXT[classification] ?? classification);
  return (
    <section className={styles.screen} aria-label="Fear & Greed">
      <p className={styles.screenTitle} aria-hidden="true">
        Fear &amp; Greed
      </p>
      {data === undefined ? (
        <p className={styles.screenMuted}>Sem leitura do índice agora.</p>
      ) : (
        <div className={styles.gauge}>
          <Gauge value={data.fearGreed} />
          <p className={styles.gaugeValue}>
            <b>{data.fearGreed}</b>
            <span>{word}</span>
          </p>
          <a
            className={styles.credit}
            href={data.source.url}
            target="_blank"
            rel={EXTERNAL_LINK_REL}
          >
            {data.source.creditText}
          </a>
        </div>
      )}
    </section>
  );
}
