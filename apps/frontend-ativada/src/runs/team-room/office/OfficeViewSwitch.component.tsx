// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../TeamRoomCard.module.css';
import { OFFICE_VIEW, type OfficeView, type TeamRoomPreference } from '../team-room-preference.js';
import { OFFICE_TEXT } from './office.constant.js';

type ViewOption = { readonly view: OfficeView; readonly text: string };

const VIEW_OPTIONS: readonly ViewOption[] = [
  { view: OFFICE_VIEW.WALKING, text: OFFICE_TEXT.VIEW_WALKING },
  { view: OFFICE_VIEW.FRONT, text: OFFICE_TEXT.VIEW_FRONT },
];

export type OfficeViewSwitchProps = {
  readonly preference: TeamRoomPreference;
  readonly onChange: (change: Partial<TeamRoomPreference>) => void;
};

// Escolhe o cenário do escritório: isométrico com a equipe andando (padrão) ou a vista frontal simples. Preferência de tela.
export function OfficeViewSwitch({ preference, onChange }: OfficeViewSwitchProps): ReactElement {
  return (
    <div className={controls.switch} role="group" aria-label={OFFICE_TEXT.VIEW_LABEL}>
      {VIEW_OPTIONS.map((option) => (
        <button
          key={option.view}
          type="button"
          className={controls.switchButton}
          aria-pressed={preference.officeView === option.view}
          onClick={() => onChange({ officeView: option.view })}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}
