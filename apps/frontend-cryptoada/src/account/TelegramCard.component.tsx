// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';

import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import styles from './Account.module.css';
import { PROFILE_QUERY_KEY, SECONDS_PER_MINUTE } from './account.constant.js';
import { useIssueTelegramCodeMutation, useUnlinkTelegramMutation } from './account.query.js';
import type { Profile, TelegramLinkCode } from './account.validation.js';

export type TelegramCardProps = { readonly profile: Profile };

function IssuedCode({ issued }: { readonly issued: TelegramLinkCode }): ReactElement {
  const queryClient = useQueryClient();
  const minutes = Math.round(issued.expiresInSeconds / SECONDS_PER_MINUTE);
  return (
    <>
      <p className={controls.muted}>
        Envie ao bot do CryptoAdA no Telegram a mensagem <code>/start {issued.code}</code>. O código
        vale por {minutes} minutos e só funciona uma vez.
      </p>
      <output className={styles.code}>{issued.code}</output>
      <button
        type="button"
        className={controls.button}
        onClick={() => void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })}
      >
        Já enviei o código
      </button>
    </>
  );
}

export function TelegramCard({ profile }: TelegramCardProps): ReactElement {
  const [issued, setIssued] = useState<TelegramLinkCode | undefined>(undefined);
  const issue = useIssueTelegramCodeMutation();
  const unlink = useUnlinkTelegramMutation();

  function handleIssue(): void {
    issue.mutate(undefined, { onSuccess: setIssued });
  }

  function handleUnlink(): void {
    unlink.mutate(undefined, { onSuccess: () => setIssued(undefined) });
  }

  return (
    <Card title="Telegram">
      <p className={styles.status}>
        {profile.telegramLinked ? 'Telegram vinculado' : 'Telegram não vinculado'}
      </p>
      {profile.telegramLinked ? (
        <button type="button" className={controls.button} onClick={handleUnlink}>
          Desvincular Telegram
        </button>
      ) : (
        <>
          {issued === undefined ? null : <IssuedCode issued={issued} />}
          <button
            type="button"
            className={controls.button}
            disabled={issue.isPending}
            onClick={handleIssue}
          >
            Gerar código de vínculo
          </button>
        </>
      )}
      {issue.isError || unlink.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível concluir. Tente novamente.
        </p>
      ) : null}
    </Card>
  );
}
