// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { NoticeBrowserSetting } from './NoticeBrowserSetting.component.js';
import { NoticeRunPreferences } from './NoticeRunPreferences.component.js';
import { NoticeSwitch } from './NoticeSwitch.component.js';
import styles from './Notices.module.css';
import { primeNoticeSound } from './notice-sound.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

// RF15: três interruptores, o botão de notificações e, por simulação, silenciar e avisar antes de comprar.
export function NoticePreferencesPanel(): ReactElement {
  const { preferences, updatePreferences } = useNoticeCenter();
  return (
    <section className={styles['prefs']} aria-label="Ajustes dos avisos">
      <h3>Avisos</h3>
      <NoticeSwitch
        id="pref-trade"
        label="Avisar quando comprar ou vender"
        help="Compras, vendas, ordens e alertas de preço aparecem na tela."
        isOn={preferences.isTradeEnabled}
        onChange={(isOn) => updatePreferences((current) => ({ ...current, isTradeEnabled: isOn }))}
      />
      <NoticeSwitch
        id="pref-stop"
        label="Avisar quando algo parar"
        help="Simulação parada, à espera de dados, analista pausou ou meta encerrada."
        isOn={preferences.isStopEnabled}
        onChange={(isOn) => updatePreferences((current) => ({ ...current, isStopEnabled: isOn }))}
      />
      <NoticeSwitch
        id="pref-sound"
        label="Som"
        help="Dois tons curtos: sobe na compra, desce na venda."
        isOn={preferences.isSoundEnabled}
        onChange={(isOn) => {
          if (isOn) primeNoticeSound();
          updatePreferences((current) => ({ ...current, isSoundEnabled: isOn }));
        }}
      />
      <NoticeBrowserSetting />
      <NoticeRunPreferences />
    </section>
  );
}
