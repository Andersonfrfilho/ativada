// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ChangeEvent, type ReactElement } from 'react';

import { useSessionService } from '../app/useAppContext.hook.js';
import { ApiError } from '../http/api.error.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import styles from './Account.module.css';
import { ACCOUNT_ERROR_CODE } from './account.constant.js';
import { isSameEmail } from './account.validation.js';
import { useAccountDeletion } from './useAccountDeletion.hook.js';

function describeFailure(error: Error): string {
  if (error instanceof ApiError && error.code === ACCOUNT_ERROR_CODE.REAUTH_REQUIRED) {
    return 'Entre novamente para apagar a conta: a confirmação vale por 5 minutos após o login.';
  }
  return 'Não foi possível apagar a conta. Tente novamente.';
}

type DeleteFailureProps = { readonly error: Error; readonly onSignInAgain: () => void };

function DeleteFailure({ error, onSignInAgain }: DeleteFailureProps): ReactElement {
  return (
    <div role="alert" className={styles.row}>
      <span className={controls.error}>{describeFailure(error)}</span>
      <button type="button" className={controls.button} onClick={onSignInAgain}>
        Sair e entrar de novo
      </button>
    </div>
  );
}

export function DeleteAccountCard(): ReactElement {
  const session = useSessionService();
  const { mutation, handleDelete, handleSignInAgain } = useAccountDeletion();
  const [typedEmail, setTypedEmail] = useState('');
  const isConfirmed = isSameEmail(typedEmail, session.readEmail());

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>): void {
    setTypedEmail(event.target.value);
  }

  return (
    <Card title="Apagar conta">
      <p className={controls.muted}>
        Apaga sua conta e todos os seus dados (estratégias, simulações, alertas e ativos). Não dá
        para desfazer.
      </p>
      <div className={controls.field}>
        <label htmlFor="confirm-email">Digite seu e-mail para confirmar</label>
        <input
          id="confirm-email"
          type="email"
          autoComplete="off"
          className={controls.input}
          value={typedEmail}
          onChange={handleEmailChange}
        />
      </div>
      <button
        type="button"
        className={`${controls.button} ${controls.danger}`}
        disabled={!isConfirmed || mutation.isPending}
        onClick={() => void handleDelete()}
      >
        Apagar minha conta
      </button>
      {mutation.isError ? (
        <DeleteFailure error={mutation.error} onSignInAgain={() => void handleSignInAgain()} />
      ) : null}
    </Card>
  );
}
