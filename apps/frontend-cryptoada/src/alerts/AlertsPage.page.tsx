// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import runStyles from '../runs/Runs.module.css';
import { AlertPreferencesCard } from './AlertPreferencesCard.component.js';
import { PriceAlertsCard } from './PriceAlertsCard.component.js';
import { SignalHistoryCard } from './SignalHistoryCard.component.js';

// Os dados chegam sozinhos: o socket avisa o que mudou e as consultas abaixo são refeitas por REST.
export function AlertsPage(): ReactElement {
  return (
    <div className={runStyles.page}>
      <h1 className={runStyles.title}>Alertas</h1>
      <SignalHistoryCard />
      <PriceAlertsCard />
      <AlertPreferencesCard />
    </div>
  );
}
