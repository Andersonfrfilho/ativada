// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useState, type ReactElement } from 'react';

import { ModelTeamSheet } from '../model-teams/ModelTeamSheet.component.js';
import { OnDemandButton } from '../model-teams/OnDemandButton.component.js';
import { useModelTeamsView } from '../model-teams/useModelTeamsView.hook.js';
import styles from './TradingRoom.module.css';

// A ficha de uma equipe ◆ (modelo, nuvem, preços, papéis, acertos) e o "Pedir opinião agora" (spec 015), aberta a partir do
// cartão dela na lista: a equipe aparece UMA vez em texto, sem um segundo boneco fora da sala.
export function ModelTeamFicha({ teamKey }: { readonly teamKey: string }): ReactElement | null {
  const view = useModelTeamsView();
  const [isOpen, setIsOpen] = useState(false);
  const id = useId();
  const card = view.teams.find((item) => item.key === teamKey);
  if (card === undefined) return null;
  return (
    <div className={styles.ficha}>
      <button
        type="button"
        className={styles.fichaButton}
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? `Fechar a ficha de ${card.name}` : `Ver a ficha de ${card.name}`}
      </button>
      <ModelTeamSheet card={card} run={view.run} id={id} isOpen={isOpen} isInline>
        <OnDemandButton card={card} view={view} />
      </ModelTeamSheet>
    </div>
  );
}
