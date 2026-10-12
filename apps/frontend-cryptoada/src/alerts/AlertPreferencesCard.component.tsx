// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ChangeEvent, type ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { useProfileQuery, useUpdateProfileMutation } from '../account/account.query.js';
import { Card } from '../layout/Card.component.js';
import accountStyles from '../account/Account.module.css';
import controls from '../styles/Controls.module.css';

export function AlertPreferencesCard(): ReactElement {
  const profile = useProfileQuery();
  const update = useUpdateProfileMutation();
  const [pendingChoice, setPendingChoice] = useState<boolean | undefined>(undefined);
  const enabled = pendingChoice ?? profile.data?.alertTelegramEnabled ?? false;

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setPendingChoice(event.target.checked);
    update.mutate(
      { alertTelegramEnabled: event.target.checked },
      { onSettled: () => setPendingChoice(undefined) },
    );
  }

  return (
    <Card title="Preferências de alerta">
      {profile.data === undefined ? (
        <p className={controls.muted}>
          {profile.isError ? 'Não foi possível carregar.' : 'Carregando…'}
        </p>
      ) : (
        <>
          <label className={accountStyles.check}>
            <input type="checkbox" checked={enabled} onChange={handleChange} />
            Receber alertas no Telegram
          </label>
          <p className={accountStyles.status}>
            {profile.data.telegramLinked ? 'Telegram vinculado' : 'Telegram não vinculado'}
          </p>
          {profile.data.telegramLinked ? null : (
            <Link to={ROUTE_PATH.ACCOUNT} className={controls.textLink}>
              Vincular na conta
            </Link>
          )}
        </>
      )}
    </Card>
  );
}
