// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { zoneLabel } from '../format/zoned-time.js';
import { ListStatus } from '../layout/ListStatus.component.js';
import styles from './Runs.module.css';
import { describeTradeRow } from './trade-row-text.js';
import type { Trade } from './run.validation.js';
import { TradeRow } from './TradeRow.component.js';
import tableStyles from './TradesTable.module.css';
import type { TradeRangeFilter } from './useTradeRows.hook.js';
import { useTradesTable } from './useTradesTable.hook.js';
import type { VisibleRows } from './virtual-rows.js';

const COLUMN_COUNT = 10;
// A linha 1 é o cabeçalho; as de dados começam na 2.
const FIRST_DATA_ROW_INDEX = 2;

export type TradesTableProps = {
  readonly runId: string;
  readonly range: TradeRangeFilter;
  readonly timeZone: string;
  readonly selectedKey: string | undefined;
  readonly onSelectTrade: (trade: Trade) => void;
};

function Spacer({ height }: { readonly height: number }): ReactElement | null {
  if (height <= 0) return null;
  return (
    <tr aria-hidden="true" className={tableStyles.spacer}>
      <td colSpan={COLUMN_COUNT} height={height} />
    </tr>
  );
}

// O rótulo do fuso fica nas duas colunas de hora: nunca uma hora sem dizer o deslocamento.
function TableHead({ zone }: { readonly zone: string }): ReactElement {
  return (
    <thead className={tableStyles.head}>
      <tr aria-rowindex={1}>
        <th scope="col">Compra ({zone})</th>
        <th scope="col">Venda ({zone})</th>
        <th scope="col">Preço de compra</th>
        <th scope="col">Preço de venda</th>
        <th scope="col">Quantidade</th>
        <th scope="col">Valor pago (USDT)</th>
        <th scope="col">Valor recebido (USDT)</th>
        <th scope="col">Taxas (USDT)</th>
        <th scope="col">Resultado (USDT)</th>
        <th scope="col">Motivo da venda</th>
      </tr>
    </thead>
  );
}

type BodyProps = {
  readonly items: readonly Trade[];
  readonly visible: VisibleRows;
  readonly timeZone: string;
  readonly selectedKey: string | undefined;
  readonly onSelectTrade: (trade: Trade) => void;
};

function VirtualBody({ items, visible, timeZone, ...selection }: BodyProps): ReactElement {
  return (
    <tbody>
      <Spacer height={visible.padTop} />
      {items.slice(visible.first, visible.end).map((trade, offset) => (
        <TradeRow
          key={trade.engineKey}
          text={describeTradeRow({ trade, timeZone })}
          rowIndex={visible.first + offset + FIRST_DATA_ROW_INDEX}
          isSelected={trade.engineKey === selection.selectedKey}
          onSelect={() => selection.onSelectTrade(trade)}
        />
      ))}
      <Spacer height={visible.padBottom} />
    </tbody>
  );
}

// Uma linha por operação, com janela virtual: o DOM tem só as linhas à vista (mais a margem), qualquer que seja o total.
export function TradesTable(props: TradesTableProps): ReactElement {
  const { timeZone, onSelectTrade, selectedKey } = props;
  const { rows, virtual } = useTradesTable(props);
  const firstTrade = rows.items[0];
  if (firstTrade === undefined) {
    return (
      <ListStatus
        isPending={rows.isPending}
        isError={rows.isError}
        emptyText="Nenhuma operação no período."
      />
    );
  }
  return (
    <div
      ref={virtual.containerRef}
      className={tableStyles.scroller}
      role="region"
      aria-label="Tabela de operações"
      tabIndex={0}
      onScroll={virtual.handleScroll}
    >
      <table className={styles.table} aria-rowcount={rows.hasMore ? -1 : rows.items.length + 1}>
        <TableHead zone={zoneLabel(timeZone, firstTrade.openedCandleTime)} />
        <VirtualBody
          items={rows.items}
          visible={virtual.visible}
          timeZone={timeZone}
          selectedKey={selectedKey}
          onSelectTrade={onSelectTrade}
        />
      </table>
    </div>
  );
}
