// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement, type ReactNode } from 'react';

import { useUserTimeZone } from '../../../account/useUserTimeZone.hook.js';
import { formatTimeInZone } from '../../../format/zoned-time.js';
import { Icon } from '../../../layout/Icon.component.js';
import { useLiveStatusQuery } from '../../live-tracking/live-status.query.js';
import type { LiveStatus } from '../../live-tracking/live-status.validation.js';
import { CompactTeamNotice } from '../CompactTeamNotice.component.js';
import { describeWaitingTeam } from '../compact-team-waiting.js';
import { describeAnnouncement } from '../team-room-lines.js';
import { TEAM_ROOM_TEXT } from '../team-room.constant.js';
import type { CompactTeamProps } from '../CompactTeam.component.js';
import { useCompactTeamModel, type CompactTeamModel } from '../useCompactTeamModel.hook.js';
import { BALCONY_TEXT } from './balcony.constant.js';
import styles from './Balcony.module.css';
import { DENSITY } from './balcony-density.js';
import { useTeamRoomPreference } from '../useTeamRoomPreference.hook.js';
import { useBalconyDensity } from './useBalconyDensity.hook.js';
import { BalconyCrew } from './BalconyCrew.component.js';

function momentText({ view, isPointed, closedText }: CompactTeamModel): string {
  if (view === undefined) return TEAM_ROOM_TEXT.POINTED_WITHOUT_SPEECH;
  return isPointed
    ? `${TEAM_ROOM_TEXT.POINTED_CANDLE} ${closedText}`
    : `${TEAM_ROOM_TEXT.LATEST_CANDLE} ${closedText}`;
}

// O horizonte da opinião: a vela em formação fecha em `nextDecisionAt`; ao rever uma vela, o que ela era.
function horizonOf(
  model: CompactTeamModel,
  status: LiveStatus,
  timeZone: string,
): string | undefined {
  if (model.isPointed) return `${BALCONY_TEXT.CLOSED_AT} ${model.closedText}`;
  const { nextDecisionAt } = status.run;
  if (nextDecisionAt === null) return undefined;
  return `${BALCONY_TEXT.VALID_UNTIL} ${formatTimeInZone(nextDecisionAt, timeZone)}`;
}

type FrameProps = {
  readonly children: ReactNode;
  readonly isAnimationOn: boolean;
  readonly onToggleAnimation: () => void;
};

function BalconyFrame({ children, isAnimationOn, onToggleAnimation }: FrameProps): ReactElement {
  const headingId = useId();
  const { density, toggle, expand } = useBalconyDensity();
  const isCollapsed = density === DENSITY.COLLAPSED;
  return (
    <aside className={styles.frame} data-density={density} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.frameTitle}>
        <Icon name="team" size={16} />
        {TEAM_ROOM_TEXT.COMPACT_TITLE}
      </h3>
      <button
        type="button"
        className={styles.densityButton}
        onClick={isCollapsed ? expand : toggle}
      >
        {isCollapsed
          ? BALCONY_TEXT.EXPAND
          : density === DENSITY.COMFORTABLE
            ? BALCONY_TEXT.COMPACT
            : BALCONY_TEXT.COMFORTABLE}
      </button>
      <button
        type="button"
        className={styles.densityButton}
        aria-pressed={!isAnimationOn}
        onClick={onToggleAnimation}
      >
        {isAnimationOn ? BALCONY_TEXT.PAUSE : BALCONY_TEXT.RESUME}
      </button>
      {children}
    </aside>
  );
}

function BalconyHeader({
  model,
  horizon,
}: {
  readonly model: CompactTeamModel;
  readonly horizon: string | undefined;
}): ReactElement {
  return (
    <div className={styles.header}>
      <p className={model.isPointed ? `${styles.moment} ${styles.pointed}` : styles.moment}>
        {model.isPointed ? <Icon name="flag" size={14} /> : null}
        {momentText(model)}
        {horizon === undefined || model.isPointed
          ? null
          : ` · opiniões ${horizon.replace('vale', 'valem')}`}
      </p>
      <p className={styles.legend}>
        <span>
          <span className={styles.markRule} aria-hidden="true">
            {BALCONY_TEXT.KIND_RULE_MARK}
          </span>{' '}
          {BALCONY_TEXT.KIND_RULE}
        </span>
        <span>
          <span className={styles.markModel} aria-hidden="true">
            {BALCONY_TEXT.KIND_MODEL_MARK}
          </span>{' '}
          {BALCONY_TEXT.KIND_MODEL}
        </span>
      </p>
      <p className={styles.fixedLine}>{BALCONY_TEXT.DISCLAIMER}</p>
      <p className={styles.visuallyHidden}>{TEAM_ROOM_TEXT.DISCLAIMER}</p>
    </div>
  );
}

type LoadedProps = CompactTeamProps & { readonly status: LiveStatus };

function LoadedBalcony(props: LoadedProps): ReactElement {
  const timeZone = useUserTimeZone();
  const model = useCompactTeamModel(props);
  if (model === undefined) {
    return <CompactTeamNotice text={describeWaitingTeam({ run: props.status.run, timeZone })} />;
  }
  const { view, step } = model;
  const isAnnounced = props.shouldAnnounce === true && model.isAnnounced;
  return (
    <>
      <BalconyHeader model={model} horizon={horizonOf(model, props.status, timeZone)} />
      {view === undefined ? null : (
        <BalconyCrew
          runId={props.runId}
          symbol={props.status.run.symbol}
          position={props.status.openPosition}
          view={view}
          auditor={model.auditor}
          horizon={horizonOf(model, props.status, timeZone)}
          step={step}
        />
      )}
      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {isAnnounced && view !== undefined ? describeAnnouncement(view, model.closedText) : ''}
      </p>
    </>
  );
}

function BalconyBody(props: CompactTeamProps): ReactElement {
  const query = useLiveStatusQuery(props.runId, true);
  if (query.data !== undefined) return <LoadedBalcony {...props} status={query.data} />;
  if (!query.isError) return <CompactTeamNotice text={TEAM_ROOM_TEXT.COMPACT_LOADING} />;
  return (
    <CompactTeamNotice
      text={TEAM_ROOM_TEXT.COMPACT_ERROR}
      isError
      onRetry={() => void query.refetch()}
    />
  );
}

// A equipe na varanda, acima do gráfico e sempre em tela: de pé, olhando o pregão, com o crachá à vista e um balão curto de
// cada um; a lousa ao lado guarda o que é longo. Mesmas frases do servidor da coluna antiga, nenhuma consulta nova.
export function TeamBalcony(props: CompactTeamProps): ReactElement {
  const { preference, update } = useTeamRoomPreference();
  const isAnimationOn = props.isAnimationOn !== false && preference.isAnimationOn;
  return (
    <BalconyFrame
      isAnimationOn={isAnimationOn}
      onToggleAnimation={() => update({ isAnimationOn: !preference.isAnimationOn })}
    >
      <BalconyBody {...props} isAnimationOn={isAnimationOn} />
    </BalconyFrame>
  );
}
