// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import controls from '../styles/Controls.module.css';
import styles from './Notices.module.css';
import { PERMISSION, readNoticePermission, requestNoticePermission } from './notice-browser.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

const DENIED_HELP =
  'O navegador bloqueou as notificações deste site. Para religar, mude a permissão do site nas configurações do navegador.';
const UNSUPPORTED_HELP = 'Este navegador não mostra notificações.';

// RF13: o pedido de permissão do navegador acontece SÓ quando a pessoa clica em "Ativar notificações" (nunca ao abrir a tela).
export function NoticeBrowserSetting(): ReactElement {
  const { preferences, updatePreferences } = useNoticeCenter();
  const [permission, setPermission] = useState(readNoticePermission);

  async function handleEnable(): Promise<void> {
    const result = await requestNoticePermission();
    setPermission(result);
    updatePreferences((current) => ({
      ...current,
      isBrowserEnabled: result === PERMISSION.GRANTED,
    }));
  }
  function handleDisable(): void {
    updatePreferences((current) => ({ ...current, isBrowserEnabled: false }));
  }
  function handleToggle(): void {
    if (isActive) handleDisable();
    else void handleEnable();
  }
  const isActive = preferences.isBrowserEnabled && permission === PERMISSION.GRANTED;

  return (
    <div className={styles['notifyBox']}>
      <p>
        {isActive
          ? 'Notificações ligadas: avisamos só quando esta aba está escondida.'
          : 'Receba o aviso mesmo com a aba escondida. Nada é pedido ao navegador até você clicar.'}
      </p>
      {permission === PERMISSION.DENIED ? <p>{DENIED_HELP}</p> : null}
      {permission === 'unsupported' ? <p>{UNSUPPORTED_HELP}</p> : null}
      {permission === 'unsupported' || permission === PERMISSION.DENIED ? null : (
        <button type="button" className={controls.button} onClick={handleToggle}>
          {isActive ? 'Desligar notificações' : 'Ativar notificações'}
        </button>
      )}
    </div>
  );
}
