// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type FormEvent, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { useAppConfig } from '../../app/useAppContext.hook.js';
import { formatSymbol } from '../../format/format.js';
import { GLOSSARY_TERM } from '../../glossary/glossary.constant.js';
import { Term } from '../../glossary/Term.component.js';
import { Card } from '../../layout/Card.component.js';
import controls from '../../styles/Controls.module.css';
import { useCreateDuelMutation } from './duel.query.js';
import { DuelTeamPicker } from './DuelTeamPicker.component.js';
import { describeCreateError, DUEL_TEXT } from './duel-text.js';
import styles from './Duel.module.css';
import { useDuelForm, type DuelForm } from './useDuelForm.hook.js';

const CREATE_NOTE =
  'O duelo cria uma simulação ao vivo por participante (cada uma usa uma vaga do seu limite). Tudo com dinheiro fictício; nenhuma ordem real.';

function Fields({ form }: { readonly form: DuelForm }): ReactElement {
  const { marketSymbols } = useAppConfig();
  return (
    <>
      <div className={controls.field}>
        <label htmlFor="duel-symbol">Par do duelo</label>
        <select
          id="duel-symbol"
          className={controls.input}
          value={form.symbol}
          onChange={(event) => form.setSymbol(event.target.value)}
        >
          {marketSymbols.map((symbol) => (
            <option key={symbol} value={symbol}>
              {formatSymbol(symbol)}
            </option>
          ))}
        </select>
      </div>
      <div className={controls.field}>
        <label htmlFor="duel-balance">Saldo fictício de cada execução</label>
        <input
          id="duel-balance"
          className={controls.input}
          inputMode="decimal"
          value={form.balance}
          aria-invalid={!form.isBalanceValid}
          onChange={(event) => form.setBalance(event.target.value)}
        />
        {form.isBalanceValid ? null : <p className={controls.error}>Use só números, com ponto.</p>}
      </div>
    </>
  );
}

function RulesPick({ form }: { readonly form: DuelForm }): ReactElement | null {
  if (form.rulesVersionId === undefined) return null;
  return (
    <label className={styles.pick}>
      <input
        type="checkbox"
        checked={form.withRules}
        onChange={(event) => form.setWithRules(event.target.checked)}
      />
      <span>
        <span aria-hidden="true">●</span> Incluir a minha estratégia de regras
      </span>
    </label>
  );
}

function DuelFormBody(): ReactElement {
  const form = useDuelForm();
  const create = useCreateDuelMutation();
  const navigate = useNavigate();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    create.mutate(form.toBody(), {
      onSuccess: (created) => void navigate(`/duelo/${created.duelId}`),
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Fields form={form} />
      <DuelTeamPicker picked={form.picked} onToggle={form.toggleTeam} />
      <RulesPick form={form} />
      <p className={controls.muted}>{CREATE_NOTE}</p>
      {create.isError ? (
        <p role="alert" className={controls.error}>
          {describeCreateError(create.error)}
        </p>
      ) : null}
      <button
        type="submit"
        className={controls.button}
        disabled={!form.canSubmit || create.isPending}
      >
        Criar duelo
      </button>
    </form>
  );
}

// "Criar duelo" (RF13): equipes ligadas e, se quiser, a sua estratégia de regras, todas com o mesmo par, saldo e vela de 15 min.
// O formulário só abre sob demanda: o cartão fica curto na página de simulações.
export function DuelCreateCard(): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Card title={DUEL_TEXT.TITLE} icon="team">
      <p className={controls.muted}>
        <Term term={GLOSSARY_TERM.DUEL}>Duelo</Term>: {DUEL_TEXT.SUBTITLE}
      </p>
      <button
        type="button"
        className={controls.button}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? 'Fechar o duelo' : 'Montar um duelo'}
      </button>
      {isOpen ? <DuelFormBody /> : null}
    </Card>
  );
}
