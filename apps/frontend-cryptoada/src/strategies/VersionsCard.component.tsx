// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDate } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import runStyles from '../runs/Runs.module.css';
import styles from './Strategies.module.css';
import { shortHash, type StrategyVersion } from './strategy.validation.js';

export type VersionsCardProps = {
  readonly versions: readonly StrategyVersion[];
  readonly baseId: string;
  readonly onUseAsBase: (versionId: string) => void;
};

export function VersionsCard({ versions, baseId, onUseAsBase }: VersionsCardProps): ReactElement {
  return (
    <Card title="Versões">
      <ul className={styles.list}>
        {versions.map((version) => (
          <li key={version.id} className={styles.item}>
            <span className={styles.name}>versão {version.version}</span>
            <span className={runStyles.num}>{shortHash(version.configHash)}</span>
            <span className={controls.muted}>{formatDate(Date.parse(version.createdAt))}</span>
            <button
              type="button"
              className={controls.button}
              aria-label={`Usar a versão ${version.version} como base`}
              disabled={version.id === baseId}
              onClick={() => onUseAsBase(version.id)}
            >
              {version.id === baseId ? 'Base atual' : 'Usar como base'}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
