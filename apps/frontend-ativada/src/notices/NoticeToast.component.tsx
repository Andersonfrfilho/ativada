// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import styles from './Notices.module.css';
import { ToastCloseButton } from './ToastCloseButton.component.js';
import { NOTICE_STATE } from './notice.constant.js';
import type { Notice } from './notice.validation.js';
import type { ToastEntry } from './notice-center.types.js';
import { NoticeBadge } from './NoticeBadge.component.js';
import { FIXED_LINE, NoticeBody } from './NoticeBody.component.js';
import { buildNoticeRuler, SignalCard } from './SignalCard.component.js';
import { isBodyClick, isPlainClick } from './notice-click.js';
import { buildChartLink, buildNoticeTarget, describeTone } from './notice-tone.js';
import { describeWhen } from './notice-text.js';
import { withMutedRun } from './notice-preferences.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';
import { useToastLifetime } from './useToastLifetime.hook.js';

type ToastProps = { readonly entry: ToastEntry; readonly isCompact: boolean };

function MuteButton(props: { readonly runId: string; readonly onDone: () => void }): ReactElement {
  const { updatePreferences } = useNoticeCenter();
  function handleMute(): void {
    updatePreferences((current) => withMutedRun(current, { runId: props.runId, isMuted: true }));
    props.onDone();
  }
  return (
    <button
      type="button"
      className={`${styles['action']} ${styles['actionQuiet']}`}
      onClick={handleMute}
    >
      Silenciar esta simulação
    </button>
  );
}

function ToastContent({ notice }: { readonly notice: Notice }): ReactElement {
  const { timeZone, now } = useNoticeCenter();
  const ruler = buildNoticeRuler(notice);
  return (
    <>
      {ruler === undefined ? (
        <NoticeBody notice={notice} timeZone={timeZone} hasFixedLine={false} />
      ) : (
        <SignalCard notice={notice} ruler={ruler} now={now} timeZone={timeZone} />
      )}
      <p className={styles['fixedLine']}>{FIXED_LINE}</p>
    </>
  );
}

function ToastActions(props: {
  readonly notice: Notice;
  readonly onDone: () => void;
}): ReactElement {
  const link = buildChartLink(props.notice);
  const target = buildNoticeTarget(props.notice);
  const { runId } = props.notice;
  const { openDrawer, openNotice } = useNoticeCenter();
  function handleManual(): void {
    props.onDone();
    openDrawer();
  }
  return (
    <div className={styles['actions']}>
      {target === undefined ? null : (
        <Link
          className={`${styles['action']} ${styles['actionMain']}`}
          to={target}
          onClick={(event) => {
            if (!isPlainClick(event)) return;
            event.preventDefault();
            openNotice(props.notice);
          }}
        >
          {link === undefined ? 'Ver alertas' : 'Ver no gráfico'}
        </Link>
      )}
      {props.notice.manual === null ? null : (
        <button type="button" className={styles['action']} onClick={handleManual}>
          Operar à mão
        </button>
      )}
      {runId === null ? null : <MuteButton runId={runId} onDone={props.onDone} />}
    </div>
  );
}

// Um aviso na tela: o ciclo da ordem troca de estado AQUI, sem empilhar três; fechar ou sumir não marca como lido.
export function NoticeToast({ entry, isCompact }: ToastProps): ReactElement {
  const center = useNoticeCenter();
  const { notice } = entry;
  const tone = describeTone(notice);
  const dismiss = (): void => center.dismissToast(notice.noticeId);
  const hold = useToastLifetime({
    milliseconds: center.toastMilliseconds,
    version: entry.version,
    isPending: notice.state === NOTICE_STATE.CREATED,
    onExpire: dismiss,
  });
  const when = describeWhen({
    occurredAt: notice.occurredAt,
    now: center.now,
    timeZone: center.timeZone,
  });
  return (
    <li
      className={`${styles['toast']} ${styles[tone.tone]} ${isCompact ? styles['compact'] : ''}`}
      onClick={(event) => (isBodyClick(event) ? center.openNotice(notice) : undefined)}
      {...hold}
    >
      <div className={styles['head']}>
        <NoticeBadge tone={tone} />
        <span className={styles['when']}>{when}</span>
        <ToastCloseButton onClose={dismiss} />
      </div>
      <ToastContent notice={notice} />
      <ToastActions notice={notice} onDone={dismiss} />
    </li>
  );
}
