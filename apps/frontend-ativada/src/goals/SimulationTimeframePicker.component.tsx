// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useState, type ReactElement } from 'react';

import { useUserTimeZone } from '../account/useUserTimeZone.hook.js';
import type { MomentContext } from '../format/zoned-moment.js';
import controls from '../styles/Controls.module.css';
import { AnalystOption, type AnalystOptionProps } from './AnalystOption.component.js';
import styles from './Goals.module.css';
import { describeFrequency, describeSimulationSummary } from './simulation-text.js';
import {
  HIDDEN_SIMULATION_TIMEFRAME_OPTIONS,
  RANKING_TIMEFRAME_NOTICE,
  SIMULATION_PICKER_LEGEND,
  SIMULATION_TIMEFRAME,
  SIMULATION_TIMEFRAME_LABEL,
  SIMULATION_TIMEFRAME_OPTIONS,
  SMALL_CANDLE_FEES_NOTICE,
  type SimulationTimeframe,
} from './simulation-timeframe.constant.js';

export type SimulationTimeframePickerProps = {
  readonly value: SimulationTimeframe;
  readonly onChange: (timeframe: SimulationTimeframe) => void;
  readonly activeCount: number;
  readonly limit: number;
  // O analista de risco (spec 007): ligado, a vela fica travada em 15 min. Sem a propriedade a opção não aparece.
  readonly analyst?: AnalystOptionProps;
};

type OptionProps = {
  readonly timeframe: SimulationTimeframe;
  readonly isChecked: boolean;
  readonly onSelect: (timeframe: SimulationTimeframe) => void;
  readonly context: MomentContext;
  readonly isLocked: boolean;
};

function TimeframeOption({
  timeframe,
  isChecked,
  onSelect,
  context,
  isLocked,
}: OptionProps): ReactElement {
  const id = useId();
  return (
    <div className={styles.option}>
      <input
        id={id}
        type="radio"
        name="simulation-timeframe"
        value={timeframe}
        checked={isChecked}
        disabled={isLocked}
        aria-describedby={`${id}-hint`}
        onChange={() => onSelect(timeframe)}
      />
      <label htmlFor={id} className={styles.optionLabel}>
        {SIMULATION_TIMEFRAME_LABEL[timeframe]}
      </label>
      <span id={`${id}-hint`} className={`${controls.muted} ${styles.optionHint}`}>
        {describeFrequency(timeframe, context)}
      </span>
    </div>
  );
}

type SectionProps = {
  readonly value: SimulationTimeframe;
  readonly onChange: (timeframe: SimulationTimeframe) => void;
  readonly context: MomentContext;
  // Com o analista ligado a vela fica travada: as opções aparecem, mas não mudam.
  readonly isLocked: boolean;
};

type OptionListProps = SectionProps & { readonly options: readonly SimulationTimeframe[] };

function OptionList({
  options,
  value,
  onChange,
  context,
  isLocked,
}: OptionListProps): ReactElement {
  return (
    <>
      {options.map((timeframe) => (
        <TimeframeOption
          key={timeframe}
          timeframe={timeframe}
          isChecked={timeframe === value}
          onSelect={onChange}
          context={context}
          isLocked={isLocked}
        />
      ))}
    </>
  );
}

// O 15 min fica escondido; escolhido, a seção não recolhe (a escolha precisa continuar visível).
function MoreOptions({ value, onChange, context, isLocked }: SectionProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const moreId = useId();
  const isShown = isOpen || HIDDEN_SIMULATION_TIMEFRAME_OPTIONS.includes(value);
  return (
    <>
      <button
        type="button"
        className={`${controls.button} ${styles.moreButton}`}
        aria-expanded={isShown}
        aria-controls={moreId}
        onClick={() => setIsOpen(!isShown)}
      >
        Mais opções
      </button>
      <div id={moreId} hidden={!isShown}>
        <OptionList
          options={HIDDEN_SIMULATION_TIMEFRAME_OPTIONS}
          value={value}
          onChange={onChange}
          context={context}
          isLocked={isLocked}
        />
      </div>
    </>
  );
}

function PickerNotices({
  value,
  context,
  activeCount,
  limit,
}: {
  readonly value: SimulationTimeframe;
  readonly context: MomentContext;
  readonly activeCount: number;
  readonly limit: number;
}): ReactElement {
  return (
    <>
      <p aria-live="polite">{describeSimulationSummary(value, context)}</p>
      <p className={styles.notice}>{RANKING_TIMEFRAME_NOTICE}</p>
      {value === SIMULATION_TIMEFRAME.QUARTER_HOUR ? (
        <p role="status" className={styles.warning}>
          <span aria-hidden="true">⚠ </span>
          {SMALL_CANDLE_FEES_NOTICE}
        </p>
      ) : null}
      <p className={controls.muted}>
        Você tem {activeCount} de {limit} simulações ao vivo.
      </p>
    </>
  );
}

export function SimulationTimeframePicker({
  value,
  onChange,
  activeCount,
  limit,
  analyst,
}: SimulationTimeframePickerProps): ReactElement {
  const context = { now: Date.now(), timeZone: useUserTimeZone() };
  const isLocked = analyst?.isOn === true;
  return (
    <fieldset className={styles.picker}>
      <legend className={styles.pickerLegend}>{SIMULATION_PICKER_LEGEND}</legend>
      <OptionList
        options={SIMULATION_TIMEFRAME_OPTIONS}
        value={value}
        onChange={onChange}
        context={context}
        isLocked={isLocked}
      />
      <MoreOptions value={value} onChange={onChange} context={context} isLocked={isLocked} />
      {analyst === undefined ? null : <AnalystOption {...analyst} />}
      <PickerNotices value={value} context={context} activeCount={activeCount} limit={limit} />
    </fieldset>
  );
}
