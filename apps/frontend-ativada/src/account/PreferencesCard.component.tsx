// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ChangeEvent, type ReactElement } from 'react';

import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { THEME_LABEL } from '../theme/ThemeToggle.component.js';
import { isTheme, setTheme } from '../theme/theme-store.js';
import { useTheme } from '../theme/useTheme.hook.js';
import styles from './Account.module.css';
import { useUpdateProfileMutation } from './account.query.js';
import type { Profile } from './account.validation.js';

export type PreferencesCardProps = { readonly profile: Profile };

function ThemeField(): ReactElement {
  const theme = useTheme();

  function handleThemeChange(event: ChangeEvent<HTMLSelectElement>): void {
    if (isTheme(event.target.value)) setTheme(event.target.value);
  }

  return (
    <div className={controls.field}>
      <label htmlFor="theme-select">Tema</label>
      <select
        id="theme-select"
        className={controls.input}
        value={theme}
        onChange={handleThemeChange}
      >
        {Object.entries(THEME_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PreferencesCard({ profile }: PreferencesCardProps): ReactElement {
  const update = useUpdateProfileMutation();
  const [pendingChoice, setPendingChoice] = useState<boolean | undefined>(undefined);
  const alertsEnabled = pendingChoice ?? profile.alertTelegramEnabled;

  function handleAlertsChange(event: ChangeEvent<HTMLInputElement>): void {
    setPendingChoice(event.target.checked);
    update.mutate(
      { alertTelegramEnabled: event.target.checked },
      { onSettled: () => setPendingChoice(undefined) },
    );
  }

  return (
    <Card title="Preferências">
      <ThemeField />
      <label className={styles.check}>
        <input type="checkbox" checked={alertsEnabled} onChange={handleAlertsChange} />
        Receber alertas no Telegram
      </label>
      {update.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível salvar. Tente novamente.
        </p>
      ) : null}
    </Card>
  );
}
