// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { NoticeSwitch } from './NoticeSwitch.component.js';
import styles from './Notices.module.css';
import { listRunOptions, type RunOption } from './notice-groups.js';
import { withEarlyRun, withMutedRun } from './notice-preferences.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

function RunPreferenceRow({ option }: { readonly option: RunOption }): ReactElement {
  const { preferences, updatePreferences } = useNoticeCenter();
  const isMuted = preferences.mutedRunIds.includes(option.runId);
  function handleMute(isOn: boolean): void {
    updatePreferences((current) => withMutedRun(current, { runId: option.runId, isMuted: isOn }));
  }
  function handleEarly(isOn: boolean): void {
    updatePreferences((current) => withEarlyRun(current, { runId: option.runId, isEarly: isOn }));
  }
  return (
    <div className={styles['runPref']}>
      <span className={styles['runName']}>
        {option.label}
        {isMuted ? <span className={styles['mutedTag']}>Silenciada</span> : null}
      </span>
      <NoticeSwitch
        id={`mute-${option.runId}`}
        label={isMuted ? 'Voltar a avisar' : 'Silenciar esta simulação'}
        help="O aviso continua no sino; só some o aviso na tela, o som e a notificação."
        isOn={isMuted}
        onChange={handleMute}
      />
      <NoticeSwitch
        id={`early-${option.runId}`}
        label="Avisar antes de comprar"
        help="Avisa quando o preço chega perto do ponto de compra desta simulação."
        isOn={preferences.earlyRunIds.includes(option.runId)}
        onChange={handleEarly}
      />
    </div>
  );
}

// Por simulação: "Silenciar esta simulação" (o aviso entra no sino, sem toast, som nem notificação) e "Avisar antes de comprar".
export function NoticeRunPreferences(): ReactElement | null {
  const { items } = useNoticeCenter();
  const options = listRunOptions(items);
  if (options.length === 0) return null;
  return (
    <div>
      <h3>Por simulação</h3>
      {options.map((option) => (
        <RunPreferenceRow key={option.runId} option={option} />
      ))}
    </div>
  );
}
