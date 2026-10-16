// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { GLOSSARY_TERM } from '../../../glossary/glossary.constant.js';
import { Term } from '../../../glossary/Term.component.js';
import { Icon } from '../../../layout/Icon.component.js';
import { BALCONY_MODELS, BALCONY_TEXT, type BalconyModel } from './balcony.constant.js';
import styles from './Balcony.module.css';
import { useBadgeSheet } from './useBadgeSheet.hook.js';

function ModelSheet({
  model,
  id,
  isOpen,
}: {
  readonly model: BalconyModel;
  readonly id: string;
  readonly isOpen: boolean;
}): ReactElement {
  return (
    <div
      id={id}
      role="group"
      aria-label={`Ficha de ${model.name}`}
      hidden={!isOpen}
      className={styles.sheet}
    >
      <strong>
        {BALCONY_TEXT.KIND_MODEL_MARK}{' '}
        <Term term={GLOSSARY_TERM.MODEL_AGENT}>{BALCONY_TEXT.KIND_MODEL.toUpperCase()}</Term> ·{' '}
        {model.role}
      </strong>
      <ul>
        <li>{BALCONY_TEXT.MODEL_NOT_YET}</li>
        <li>Onde roda: —</li>
        <li>Custo estimado por dia: —</li>
        <li>Última chamada: —</li>
        <li>Taxa de falha: —</li>
        <li>
          <Term term={GLOSSARY_TERM.IN_OBSERVATION}>Em observação</Term>: ainda não existe, não
          vota.
        </li>
      </ul>
    </div>
  );
}

function ModelChip({ model }: { readonly model: BalconyModel }): ReactElement {
  const sheetId = useId();
  const sheet = useBadgeSheet();
  return (
    <li className={styles.modelItem}>
      <div ref={sheet.rootRef} className={styles.modelRoot}>
        <button
          ref={sheet.buttonRef}
          type="button"
          className={styles.modelButton}
          aria-expanded={sheet.isOpen}
          aria-controls={sheetId}
          aria-label={`${model.name}, ${model.role}, modelo, em breve. Ver a ficha`}
          onClick={sheet.toggle}
        >
          <span className={styles.diamond} aria-hidden="true">
            <Icon name="chip" size={12} />
          </span>
          <span className={styles.modelText}>
            <strong>{model.name}</strong>
            <span>{model.role}</span>
          </span>
        </button>
        <ModelSheet model={model} id={sheetId} isOpen={sheet.isOpen} />
      </div>
    </li>
  );
}

// No celular os três viram um chip só: "◆ 3 em breve", com a lista na ficha.
function ModelsSummary(): ReactElement {
  const sheetId = useId();
  const sheet = useBadgeSheet();
  return (
    <div ref={sheet.rootRef} className={styles.modelsSummary}>
      <button
        ref={sheet.buttonRef}
        type="button"
        className={styles.modelButton}
        aria-expanded={sheet.isOpen}
        aria-controls={sheetId}
        onClick={sheet.toggle}
      >
        <span aria-hidden="true">{BALCONY_TEXT.KIND_MODEL_MARK}</span> {BALCONY_MODELS.length} em
        breve
      </button>
      <div
        id={sheetId}
        role="group"
        aria-label="Agentes de modelo"
        hidden={!sheet.isOpen}
        className={styles.sheet}
      >
        <strong>{BALCONY_TEXT.KIND_MODEL_MARK} MODELOS · em breve</strong>
        <ul>
          {BALCONY_MODELS.map((model) => (
            <li key={model.name}>
              {model.name}, {model.role}
            </li>
          ))}
          <li>{BALCONY_TEXT.MODEL_NOT_YET}</li>
        </ul>
      </div>
    </div>
  );
}

// Os agentes de MODELO (◆): apagados, com moldura tracejada roxa, losango com chip e a palavra "em breve". Nunca falam nem votam.
export function BalconyModels(): ReactElement {
  return (
    <>
      <ModelsSummary />
      <div className={styles.models}>
        <p className={styles.modelsHead}>
          <span aria-hidden="true">{BALCONY_TEXT.KIND_MODEL_MARK}</span> MODELOS · em breve
        </p>
        <ul className={styles.modelList}>
          {BALCONY_MODELS.map((model) => (
            <ModelChip key={model.name} model={model} />
          ))}
        </ul>
      </div>
    </>
  );
}
