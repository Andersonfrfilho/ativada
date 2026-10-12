// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useSessionService } from '../app/useAppContext.hook.js';
import controls from '../styles/Controls.module.css';
import styles from './Account.module.css';
import { DeleteAccountCard } from './DeleteAccountCard.component.js';
import { ExportCard } from './ExportCard.component.js';
import { PreferencesCard } from './PreferencesCard.component.js';
import { TelegramCard } from './TelegramCard.component.js';
import { useProfileQuery } from './account.query.js';

export function AccountPage(): ReactElement {
  const session = useSessionService();
  const profile = useProfileQuery();
  const email = session.readEmail();

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Conta</h1>
      {email === undefined ? null : (
        <p className={controls.muted}>
          Conectado como <strong>{email}</strong>
        </p>
      )}
      {profile.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível carregar sua conta. Tente novamente.
        </p>
      ) : null}
      {profile.data === undefined ? null : (
        <>
          <PreferencesCard profile={profile.data} />
          <TelegramCard profile={profile.data} />
        </>
      )}
      <ExportCard />
      <DeleteAccountCard />
    </div>
  );
}
