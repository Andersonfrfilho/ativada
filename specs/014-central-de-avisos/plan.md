# Plano — Spec 014

Fatos conferidos em 2026-10-16 (não repetir a busca):

- **Stream.** `apps/frontend-ativada/src/live/stream.validation.ts`: mensagens `event` (`runId`, `kind`, `eventId`, `at`),
  `price_alert`, `tick`, `candle`, `resync`, `renewed`. `useLiveStream` (`AppShell` → `LiveMarketProvider`) só agenda
  `invalidateQueries` por raiz (`runs` | `price-alerts`) pelo `createRefetchScheduler`; `resync` invalida tudo.
  `StreamStatus`: `connecting | live | reconnecting | stopped | blocked` (`stream.constant.ts`).
- **O que o worker avisa.** `packages/database/src/run-events/publish-step-events.ts`: um `pg_notify` por linha de
  `signals`, `fills` e `equity_points` do passo (`signal`, `trade`, `balance`), na transação do candle. `warning` sai da
  espera por dados e da varredura de parada (`run-stall-alert.ts`); `analyst` da spec 007. **Ordem cancelada ou expirada não
  tem aviso próprio**, mas o passo dela grava `equity_points` → sai `balance` → a raiz `runs` é refeita. Basta.
- **Ciclo da ordem gravado** (ADR 0002 §g, linha 117): `orders.status` monotônico `created < filled|cancelled|expired|rejected`
  com `reason` (`packages/database/src/run-results/run-result.constant.ts`: `below_min_notional`, `zero_atr`, `invalid_stop`,
  `opposite_signal`, `command`, `gap`, `volume_capped`); a limitada expira no N-ésimo candle (`expiryCandles`); o SELL
  cancela a pendente (`opposite_signal`); lacuna caduca a pendente (`gap`). Saída: `EXIT_REASON` `stop|target|signal|command|gap`
  (painel já tem `EXIT_REASON_PLAIN_TEXT` em `src/runs/run.constant.ts`).
- **Tempo da ordem a mercado.** Decide no fechamento de `t`, preenche pela abertura de `t+1`, e o ao vivo só grava o
  preenchimento quando `t+1` FECHA. Ou seja, "pedida" dura uma vela inteira: a frase tem de dizer quando confirma.
- **Gatilhos.** `live-status.validation.ts` (`ruleTriggerSchema`): `metric` (`close_price`, `rsi`, …), `direction`, `basis`,
  `current`, `threshold`, `distance`, `distanceRate`, `isMet`, `vote`, `weight`, `message`; `triggers` traz `scoreGap`. Não há
  "esta regra sozinha completa o placar": vira o campo aditivo `completesScore` (T1.3).
- **Painel.** Cabeçalho em `src/layout/HeaderMenu.component.tsx` (menu recolhido até 1100 px; o sino fica FORA do painel
  recolhível). Ícones SVG em `src/layout/Icon.component.tsx` (já tem `alerts` = sino, `arrowUp/Down`, `alert`, `pause`,
  `check`, `close`). Tokens em `src/styles/global.css` (`--buy/--sell/--warn/--bench`, `--motion-fast/medium`,
  `--ease-out`). `localStorage` hoje guarda só tema, camadas do gráfico e a sala.
- **Preview.** `docs/preview/central-de-avisos/index.html` (autônomo) é a referência visual; capturas por
  `playwright-core` do repo + Edge.

## D1. Onde mora cada peça

| Peça | Lugar | Por quê |
|---|---|---|
| Rota `GET /v1/notices` | `apps/api-ativada/src/notices/` (`notices.routes.ts`, `notices.docs.ts`, `list-notices.use-case.ts`, `notice-messages.ts`) | Frases do servidor, catálogo fechado; `access` + `documentation` |
| Leitura | `packages/database/src/notices/notice-feed.repository.ts` (`OwnerScope` no tipo) | `UNION ALL` de `orders`, `positions`, `runs`, `alerts`, `price_alerts` por dono, cursor `(occurred_at, notice_id)` |
| Estado no painel | `apps/frontend-ativada/src/notices/` | Pasta própria; nada dentro de `runs/` |
| Ligação ao stream | consulta `['runs', 'notices']` e `['price-alerts', 'notices']` | O agendador existente já refaz; zero mudança no `StreamClient` |

Arquivos do painel (cada um ≤ 200 linhas, componente ≤ 40):

```
src/notices/
  notice.validation.ts        Zod da rota (espelho do OpenAPI)
  notices.query.ts            useNoticesQuery (infinite), useNoticeSummary(after)
  notice-store.ts             PURO: mescla por noticeId, troca de estado, não lidos, silenciados, teto 50
  notice-preferences.ts       PURO: 3 interruptores, silenciados, "avisar antes", cursor lido; leitura/escrita tolerante
  near-trigger.ts             PURO: distância em BigInt, histerese 0,3%/0,6%, uma vez por (run, vela, regra)
  notice-text.ts              hora no fuso, "há instantes", resultado com seta + sinal
  track-record.ts             linha de acerto a partir de projections/analyst (só desloca vírgula)
  useNoticeCenter.hook.ts     junta consulta + store + preferências; expõe toasts e não lidos
  useTabTitle.hook.ts         "(N) AtivAdA" com a aba escondida
  useBrowserNotification.hook.ts  pedido só no clique; tag = noticeId
  notice-sound.ts             Web Audio, dois tons, só depois do gesto
  NoticeBell.component.tsx    sino + contador + ponto âmbar
  NoticeDrawer.component.tsx  gaveta (dialog), filtros, marcar lidos
  NoticeItem.component.tsx    item da gaveta (detalhe recolhido)
  NoticeToast.component.tsx   cartão; troca de estado no lugar
  NoticeToastStack.component.tsx  pilha (3), compacta com gráfico, some da própria simulação
  NoticeAnnouncer.component.tsx   o ÚNICO aria-live
  NoticePreferences.component.tsx  3 interruptores + notificações + listas por simulação
  NoticeFirstRun.component.tsx    balão do primeiro uso
  NoticeEmpty.component.tsx       vazio amigável
  ConnectionStrip.component.tsx   "Avisos pausados — reconectando…"
  Notices.module.css
```

## D2. Regras de comportamento (puras, testáveis)

1. **Mesclar.** Item com `noticeId` conhecido substitui o anterior; se o `state` mudou e o toast está visível, troca no
   lugar e o anunciador fala só "Compra executada a 12,458". Não volta estado (monotônico como `orders`).
2. **Não lido.** Não lido = `occurredAt` > cursor lido E não é exemplo. "Marcar todos" = cursor para o mais novo.
3. **Toast.** Só se: preferência do tipo ligada, simulação não silenciada, não é a simulação aberta na tela, e o item é
   novo nesta sessão (o que já estava no primeiro carregamento não vira toast).
4. **Resumo.** No `resync` ou volta da aba após > 60 s: `after = cursor visto`; contagem por tipo; um toast sem som.
5. **Perto de comprar.** Entra a ≤ 0,3%, sai a > 0,6% ou no fechamento da vela; chave `(runId, candleTime, ruleId)`.
6. **Notificação e som.** Só com a aba escondida (notificação) ou visível (som), nunca os dois para o mesmo aviso.

## D3. Rota `GET /v1/notices`

- `after` (cursor opaco), `limit` (padrão 30, teto 50), `scope=runs|price-alerts|all`. Só do dono (`userId` do token);
  contrato negativo entre usuários; sem dado alheio nem id malformado (mesmo `404` não se aplica: é lista).
- Política de taxa `NOTICES` 60/min por usuário (o agendador já agrupa os avisos do stream).
- No máximo 3 consultas por pedido; sem cache no servidor; frases sem hora (o painel formata).
- `price`, `fee`, `resultRate` em texto decimal exato; arredondamento contra o usuário igual ao `trade-summary`.
- Bloco `manual` (só em `entry.*` e `exit.*`, RF27 a RF33): `orderType`, `decidedAt`, `fillOpenAt`, `referencePrice`,
  `quantity` (de `fills`), `runBalance`, `notional`, `targetPrice`, `stopPrice`, `tickSize`, `quantityStep` (de
  `symbol-filters`), `costRate` (taxa + deslizamento × 2 dos `RunParameters`), `netGainRate`, `netLossRate`, `netRatio`,
  `breakEvenEntry` (`(alvo + proteção) ÷ (2 + 2 × custo)`, para baixo no tick), `history` (`days`, `netReturnRate`,
  `hits`, `counted` do último backtest/walk-forward concluído da versão, par e vela; `null` sem nenhum) e as frases
  `manual.*`. Tudo `EngineDecimal`, puro, em `notice-manual.ts`, com contas à mão no contrato.
- Proporção para "Meu saldo": no painel, `BigInt` escala 8 (`src/format/decimal.ts`): `quantity × meuSaldo ÷ runBalance`,
  para baixo no `quantityStep`. É a única conta do painel além do desenho da régua.

## D5. Ficha, régua e cópia (painel)

| Peça | Arquivo |
|---|---|
| Ficha (selo, palavra, preço, linha direta) | `SignalCard.component.tsx` |
| Régua (zonas, marcas, cursor; vertical por container query) | `LevelRuler.component.tsx` em SVG (posições como atributos `x`/`width`, nunca `style=`; o preview usa `style` só por ser HTML solto) + `level-ruler.ts` (posições, o único `Number`, só desenho) |
| Barra "perto de comprar" | `TriggerProgress.component.tsx` |
| Operar à mão | `ManualTradePanel.component.tsx`, `manual-trade.ts` (proporção `BigInt`, texto copiado com ponto decimal), `useCopyValue.hook.ts` (`navigator.clipboard.writeText`, "Copiado" 2 s, anúncio) |
| Link do par | `exchange-link.ts`: `https://www.binance.com/pt-BR/trade/<BASE>_<QUOTE>`, montado de `symbol` (lista fechada dos pares habilitados), `target="_blank" rel="noopener noreferrer"`; contrato prova que nada além do par entra na URL |
| "Meu saldo" | `my-balance.ts` (`localStorage`, texto decimal validado; nunca vai à API) |

## D4. Riscos de implementação

- O `UNION ALL` precisa de índice? Medir em T1.1 com o seed grande; sem índice novo se p95 < 150 ms (sem migration).
- Notificação no Windows agrupa por app; `tag` resolve duplicata, não agrupamento.
- `AudioContext` só nasce depois do gesto (o próprio clique em "Som").
