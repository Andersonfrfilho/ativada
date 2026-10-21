// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import { isRateLimitError } from '../../http/rate-limit.js';
import { Card } from '../../layout/Card.component.js';
import type { IconName } from '../../layout/Icon.component.js';
import controls from '../../styles/Controls.module.css';
import { RateLimitNotice } from '../RateLimitNotice.component.js';
import type { LiveStatus } from './live-status.validation.js';

export type LiveSectionPlaceholderProps = {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly query: UseQueryResult<LiveStatus>;
};

// O lugar do cartão enquanto o acompanhamento não chegou: carregando, limite de consultas ou erro com "Tentar de novo"; nunca some calado.
export function LiveSectionPlaceholder({
  id,
  title,
  icon,
  query,
}: LiveSectionPlaceholderProps): ReactElement {
  const retry = (): void => void query.refetch();
  const isLimited = isRateLimitError(query.error ?? query.failureReason);
  return (
    <Card id={id} title={title} icon={icon}>
      {isLimited ? (
        <RateLimitNotice retryAt={undefined} onRetry={retry} />
      ) : query.isError ? (
        <div role="alert">
          <p className={controls.error}>
            Não foi possível carregar esta parte agora. O resto da tela segue funcionando.
          </p>
          <button type="button" className={controls.button} onClick={retry}>
            Tentar de novo
          </button>
        </div>
      ) : (
        <p role="status" className={controls.muted}>
          Carregando…
        </p>
      )}
    </Card>
  );
}
