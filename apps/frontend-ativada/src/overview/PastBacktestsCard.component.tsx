// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { formatSignedPercentDown } from '../format/decimal.js';
import { formatSymbol } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import { Icon } from '../layout/Icon.component.js';
import { CHIP_TONE, StatusChip } from '../runs/live-tracking/StatusChip.component.js';
import { useRunListQuery } from '../runs/runs.query.js';
import controls from '../styles/Controls.module.css';
import styles from './LiveSimulations.module.css';
import {
  isSmallSample,
  PAST_WINS_SHOWN,
  pickProfitableBacktests,
  SMALL_SAMPLE_TRADES,
  type PastWin,
} from './past-backtests.js';

function describeTrades(win: PastWin): string {
  if (win.trades === undefined) return 'operações não informadas';
  return `${win.trades} ${win.trades === 1 ? 'operação' : 'operações'}`;
}

function PastWinItem({ win }: { readonly win: PastWin }): ReactElement {
  return (
    <li className={styles.pastItem}>
      <Link to={`${ROUTE_PATH.BACKTESTS}/${win.run.id}`} className={styles.pastLink}>
        {formatSymbol(win.run.symbol)}
      </Link>
      <span className={styles.pastResult}>
        <Icon name="arrowUp" size={14} /> Ganho {formatSignedPercentDown(win.rate)}
      </span>
      <span className={styles.muted}>
        {describeTrades(win)}
        {isSmallSample(win) ? ' · amostra pequena' : ''}
      </span>
    </li>
  );
}

function PastBody(): ReactElement {
  const query = useRunListQuery('backtest');
  if (query.isError) {
    return (
      <p role="alert" className={controls.error}>
        Não foi possível carregar os backtests agora. Tente de novo em instantes.
      </p>
    );
  }
  if (query.data === undefined) return <p role="status">Carregando os backtests…</p>;
  const loaded = query.data.pages.flatMap((page) => page.items);
  const wins = pickProfitableBacktests(loaded);
  return (
    <>
      <p className={styles.pastNote}>
        Teste no passado, não é ao vivo. Das últimas {loaded.length} execuções carregadas,{' '}
        {wins.length} fecharam no lucro. Com menos de {SMALL_SAMPLE_TRADES} operações o resultado
        pode ser sorte: não é recomendação.
      </p>
      {wins.length === 0 ? (
        <p className={styles.muted}>Nenhum backtest carregado fechou no lucro.</p>
      ) : (
        <ul className={styles.pastList} aria-label="Backtests que lucraram">
          {wins.slice(0, PAST_WINS_SHOWN).map((win) => (
            <PastWinItem key={win.run.id} win={win} />
          ))}
        </ul>
      )}
    </>
  );
}

// Separado das simulações ao vivo e recolhido: o pedido só sai quando a pessoa abre (não gasta o limite de requisições).
export function PastBacktestsCard(): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Card
      title="Backtests que lucraram (no passado)"
      icon="backtests"
      aside={
        <StatusChip tone={CHIP_TONE.WARN} icon="info">
          Teste no passado, não é ao vivo
        </StatusChip>
      }
    >
      <details className={styles.past} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
        <summary className={styles.summaryToggle}>
          <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={16} />
          {isOpen ? 'Esconder' : 'Mostrar'} os backtests que lucraram
        </summary>
        {isOpen ? <PastBody /> : null}
      </details>
    </Card>
  );
}
