# Spec 014 — Central de avisos na tela (compra, venda, ordem e parada, sem sair do painel)

## 1. Problema

Em 2026-10-16 o usuário (Anderson, leigo em investimento) perguntou, nas palavras dele: "e como recebemos esses avisos de
compra e venda?". Oferecido o Telegram, respondeu: "não precisa, quero saber de usabilidade de tela". Depois acrescentou:
"para pessoa utilizar ficar fácil", "para o usuário ficar acompanhando e saber o momento de comprar, em qual preço, e o
momento de vender", "e se vai cancelar ou não", "para já falar de lá: compre isso, vende nesse valor", "precisa ser bem
visual as recomendações de compra e venda", "porque quem tiver usando vai fazer isso manualmente" e "a não ser que você
tenha uma forma rápida de já ir para o link com a oferta montada para a Binance".

Hoje o painel **sabe** de tudo, mas **não avisa** de nada:

- O WebSocket `GET /v1/stream` já entrega `event` (`signal`, `trade`, `balance`, `warning`, `analyst`), `price_alert`,
  `tick` e `candle` (ADR 0002 "Tempo real"). `useLiveStream` (no `AppShell`) só **invalida** as consultas `runs` ou
  `price-alerts`: as telas se atualizam **em silêncio**.
- Não há aviso explícito, som, notificação do navegador, sino, histórico de avisos, contador fora da aba nem estado
  "ordem pedida / executada / cancelada". O único `aria-live` é por cartão (gráfico, sala da equipe, seletor de vela).
- Quem deixa a aba em segundo plano, ou está noutra tela do painel, **perde** a compra e a venda. Quem está olhando só vê o
  número mudar, sem saber **quando**, **a que preço** e **por quê**.

Exemplo real que guia a spec (LINK/USDT, vela de 15 min): **compra simulada a 12,458** pedida no fechamento das 20:15
(executa pelo preço de abertura da vela das 20:15 e a simulação confirma quando ela fecha, às 20:30); **venda para limitar a
perda a 12,372** às 00:30 (a saída de proteção estava em 12,379; saiu um pouco abaixo pelo escorregamento), **−0,13%** no
saldo da simulação. O acerto do histórico (spec 011, T0.2 da 007, 183 dias): a estratégia (Placar clássico) acertou o lado
**7.225 de 15.085 (47,9%)**, abaixo da moeda ao ar; a Reversão, **1.420 de 2.552 (55,6%)**, acima.

## 2. Objetivo

Uma pessoa leiga, sem aprender nada e sem configurar nada, **fica sabendo pela própria tela**:

1. **O momento e o preço** de cada compra e venda simulada, com o motivo em linguagem comum.
2. **O ciclo da ordem**: pedida (e o que a faria cancelar) → executada (preço real e taxa) ou cancelada/recusada (por quê).
3. **Perto do momento de comprar** (opcional, por simulação): qual condição falta, a que preço e quando a vela fecha.
4. **Quando algo para**: simulação parada ou retomada, à espera de dados, analista pausou, meta encerrada, alerta de preço.
5. **O que perdeu** enquanto estava fora (aba escondida, conexão caída).

Tudo num lugar óbvio — **o sino no cabeçalho** — e com honestidade: é o sinal de uma **simulação com dinheiro fictício**,
nunca ordem real nem recomendação; cada aviso de compra e venda mostra **o acerto histórico** ao lado da moeda ao ar
(50%), para a pessoa calibrar a confiança.

E porque **quem usa vai executar o sinal à mão** na corretora, cada sinal traz o que essa pessoa precisa, sem inventar
nada: tipo de ordem e horário, quantidade (da simulação e proporcional ao saldo dela), as três ordens com os preços no tick
do par, custo e líquido, quando desistir, botões de copiar e o link do par na Binance. O AtivAdA **não envia ordem** e não tem
chave da corretora.

Preview navegável: `docs/preview/central-de-avisos/index.html` (cenas: primeiro uso, perto de comprar, compra pedida, sinal
de compra, comprado com gráfico e equipe, operar à mão, sinal de venda, ordem cancelada, sino e gaveta, sem avisos, aba em
segundo plano, conexão caída, resumo ao voltar, ajustes), capturas em `docs/preview/central-de-avisos/capturas/`.

## 3. Requisitos funcionais

### Fonte e forma dos avisos

- **RF01 — Fonte única no servidor.** Os avisos vêm de `GET /v1/notices?after=&limit=` (nova, só leitura, sem migration;
  D3-A): uma lista do dono, decrescente, com cursor, montada do que o banco **já grava** — `orders` (ciclo e `reason`),
  `fills` (preço, taxa), `positions` (`exitReason`, alvo e stop, resultado), `runs` (`stalled_since`, `waiting_*`,
  `goal_outcome`), `alerts` (`STALL`/`RESUME`) e `price_alerts` (`last_fired_at`). Com a spec 007 Fase 2 pronta, também a
  pausa do analista; com a spec 013, o "mínimo de lucro barrou". Cada item: `noticeId` estável (tipo + chave natural,
  p.ex. `order:<runId>:<orderKey>`), `runId` (nulo no alerta de preço), `symbol`, `timeframe`, `kind`, `state`,
  `occurredAt`, `candleTime`, `price`, `fee`, `resultRate`, `targetPrice`, `stopPrice`, `reasonCode`, `title`, `message`
  e `detail` (frases do catálogo fechado da §5, sem data nem hora: o painel formata no fuso do usuário).
- **RF02 — O stream só acorda.** Nenhuma mensagem nova no WebSocket: a consulta `['runs', 'notices']` fica sob a raiz
  `runs`, então todo `event` já a refaz (o `balance` sai em todo passo, inclusive no que só cancela ou expira uma ordem).
  `price_alert` refaz `['price-alerts', 'notices']`, o mesmo endpoint filtrado. O REST continua a fonte da verdade.
- **RF03 — Um aviso por ordem, que muda de estado (D1-A).** O ciclo da ordem é UM aviso com o mesmo `noticeId`:
  - **Pedida** (`created`): "Compra pedida · LINK/USDT 15 min" · "Executa pelo preço de abertura da vela das 20:15; a
    simulação confirma às 20:30." · **"Vai cancelar?"**: "Cancela se a estratégia mudar de ideia no próximo fechamento, se
    a simulação for parada ou se faltarem dados do mercado." (limitada: "Executa se o preço chegar a 12,40 até a vela das
    21:00; senão, cancela.")
  - **Executada** (`filled`): "▲ COMPRA · Sinal de compra: LINK/USDT a 12,458" · "executada às 20:30 · vender no alvo 12,590 · sair se cair a 12,379 · taxa
    0,0125 USDT".
  - **Cancelada / expirada / recusada**: ícone próprio (círculo cortado), palavra "Cancelada" e cor neutra (`--bench`),
    nunca vermelho (não é erro nem perda). Motivo em linguagem comum (§5).
  - O toast que está na tela **troca de estado no lugar** (sem empilhar três), com o anúncio `aria-live` só da troca.
- **RF04 — Venda com motivo.** Saída por alvo ("atingiu o alvo de lucro"), proteção ("saiu para limitar a perda"),
  estratégia ("a estratégia mandou vender"), meta ("a meta chegou ao fim") e lacuna ("faltaram dados do mercado"), com
  preço, hora e resultado ("−0,13% no saldo"). Seta + sinal + palavra + cor (▼ / "−" / "Venda" / `--sell` só no resultado
  negativo; resultado positivo usa `--buy`; zero é cinza com "=").

### Toast (aviso na tela)

- **RF05 — Aparência.** Cartão de 360 px (largura total menos 32 px a 375 px), com faixa lateral da cor do tipo, ícone +
  palavra do estado, título com par e vela, preço em `--font-data`, hora no fuso do usuário ("há instantes", "às 20:15") e
  a linha de acerto (RF16). Dois botões: **"Ver no gráfico"** (primário, 44 px, leva a
  `/backtests/:runId?operacao=<chave>#grafico`, a seleção da spec 005) e **"Silenciar esta simulação"** (secundário), mais
  fechar (×, `aria-label="Fechar aviso"`).
- **RF06 — Onde e quantos.** Canto inferior direito a partir de 1024 px, rodapé de largura total abaixo disso, acima da
  área segura. No máximo **3** visíveis empilhados (o mais novo em cima); o resto vira "+N no sino". Nunca cobre o
  gráfico: **na tela da própria simulação o toast dela não aparece** (o gráfico, a linha de pulso e a sala já mostram, D8-A);
  ali só o sino conta. Em qualquer tela com o gráfico, a pilha recolhe para a forma compacta de uma linha. Abaixo de 640 px
  o toast mostra selo, palavra, preço, linha direta, linha fixa e botões; a régua e o ciclo ficam na gaveta (um toque).
- **RF07 — Tempo.** Some em 8 s (D7-A), pausa enquanto o mouse está em cima ou o foco está dentro, e ordem pedida fica até
  mudar de estado. Fechar ou sumir **não** marca como lido: o aviso continua no sino.

### Sino e central (gaveta)

- **RF08 — Sino.** No cabeçalho, sempre visível (inclusive a 375 px, fora do menu recolhido), 44×44 px, com contador de não
  lidos (até "9+"); `aria-label="Avisos: 2 não lidos"`. Clicar abre a gaveta; Esc fecha e devolve o foco ao sino.
- **RF09 — Gaveta.** Painel lateral de 400 px (tela cheia a 375 px), `role="dialog"`, `aria-modal`, foco no título ao abrir
  e preso dentro. Cabeçalho: "Avisos", a frase fixa "Simulações com dinheiro fictício. Não é recomendação.", "Marcar todos
  como lidos" e o filtro **Todas / por simulação** (chips; só as simulações com aviso). Itens agrupados por dia ("Hoje",
  "Ontem"), não lidos com ponto + "Novo" + fundo `--accent-soft`; cada item reabre o detalhe (motivo, "Vai cancelar?",
  acerto) e tem "Ver no gráfico". Até 50 itens; "Ver avisos anteriores" pagina pelo cursor.
- **RF10 — Vazio amigável.** "Sem avisos ainda. Quando uma simulação comprar ou vender, aparece aqui." com o atalho
  "Começar uma simulação" (para quem não tem nenhuma ao vivo).
- **RF11 — Primeiro uso.** Na primeira vez que o sino ganha um aviso, um balão curto aponta para ele: "Seus avisos ficam
  aqui. Já estão ligados para compras, vendas e paradas." com "Entendi" e "Ajustar". Aparece uma vez (lembrado no
  aparelho). Nenhuma tela de configuração obrigatória.

### Aba em segundo plano, notificação e som

- **RF12 — Título da aba.** Com a aba escondida (`document.visibilityState`), o título vira "(2) AtivAdA" com os não lidos
  que chegaram; volta ao normal ao voltar. O ícone da aba ganha um ponto (variante pronta em `public/`, sem desenhar em
  canvas).
- **RF13 — Notificação do navegador (opcional).** Desligada por padrão. O pedido de permissão do navegador acontece **só**
  quando a pessoa clica em "Ativar notificações" (nunca ao abrir a tela). Só notifica com a aba escondida; texto:
  "▲ Sinal de compra · LINK/USDT a 12,458" / "Alvo 12,590 · sair se cair a 12,379. Simulação com dinheiro fictício." (D9-A); `tag` = `noticeId`, então duas abas
  não duplicam. Permissão negada: a frase diz como religar no navegador, sem insistir.
- **RF14 — Som (opcional).** Desligado por padrão, interruptor "Som". Dois tons curtos (< 250 ms) gerados por Web Audio
  (sobe na compra, desce na venda, um tom neutro no resto), sem arquivo novo; nunca no estado "pedida" nem no resumo.

### Preferências

- **RF15 — Três interruptores (D6-A)**, numa seção "Avisos" dentro da gaveta (botão "Ajustar") e na Conta: "Avisar quando
  comprar ou vender" (ligado; inclui a ordem e o alerta de preço), "Avisar quando algo parar" (ligado: parada, espera por
  dados, analista, meta) e "Som" (desligado). Abaixo, o botão "Ativar notificações" (RF13) e, por simulação, "Silenciar
  esta simulação" (lista com "Voltar a avisar") e "Avisar antes de comprar" (RF18). Uma linha de ajuda por controle.
  Silenciar não apaga: o aviso entra no sino sem toast, som nem notificação. Guardado no aparelho (D2-A).

### Acerto e honestidade

- **RF16 — Acerto em cada aviso de compra, venda e "perto de" (D5-A).** Uma linha: "Acerto no histórico: 55,6% (1.420 de
  2.552) · cara ou coroa: 50%", com o veredito de Wilson em ícone + palavra ("Acima da moeda", "Igual à moeda", "Abaixo
  da moeda", "Poucas previsões"). Fonte: o resumo de `GET /v1/runs/:runId/projections` (spec 009) ou, com o analista, o
  especialista que puxou a decisão em `GET /v1/runs/:runId/analyst` (spec 007); o painel só desloca a vírgula do texto do
  servidor. Sem dado: a linha some (nunca "0%").
- **RF17 — Tom do sinal: direto, curto, com preço (D11-A).** Pedido do usuário: "para já falar de lá: compre isso,
  vende nesse valor". O aviso e o balão da equipe falam o SINAL da estratégia em forma direta, sempre com o preço:
  - compra: **"Sinal de compra: LINK/USDT a 12,458 · vender no alvo 12,590 · sair se cair a 12,379"**;
  - venda: **"Sinal de venda: sair a 12,372"** + o motivo ("caiu até a saída de proteção", "chegou ao alvo", "a estratégia
    virou para vender");
  - logo abaixo, a **linha fixa pequena**: "Simulação com dinheiro fictício · tendência, não promessa · acerto desta
    estratégia: 7.225 de 15.085 (cara ou coroa = 50%)" (com analista: "acerto da Reversão: 1.420 de 2.552").
  O verbo é do SINAL ("Sinal de compra/venda", "vender no alvo", "sair se cair a"), nunca da pessoa: proibido "você deve",
  "compre agora", "garantido", "certeza", "oportunidade", "lucro certo". Quem decide é o usuário; o painel não executa nada
  fora da simulação. Termos técnicos trocados (§5): "saída de proteção"/"sair se cair a" no lugar de stop, "faixa" no lugar
  de ATR. Avisos de exemplo levam o selo "Exemplo — nada aconteceu" e não entram no sino.

### Perto do momento de comprar

- **RF18 — Aviso antecipado (D4-A: só para simulação marcada "Avisar antes de comprar").** Com `triggers.state =
  awaiting_entry` (spec 008), para a regra de preço (`metric = close_price`, `basis = exact`, `isMet = false`) cujo voto
  completa o placar (`completesScore`, campo aditivo da T1.3), quando o preço ao vivo fica a ≤ 0,3% do limite: "Perto do
  momento de comprar · LINK/USDT 15 min" · "A Reversão vota comprar se a vela fechar abaixo de 12,400 (fecha às 20:15).
  Agora: 12,430 — falta 0,24%." · "Tendência, não promessa." Uma vez por (simulação, vela, regra); some sozinho se o preço
  se afastar além de 0,6% (histerese) ou a vela fechar. Distância em `BigInt` no texto, nunca `Number`.

### Conexão e resumo

- **RF19 — Conexão caída.** Com `StreamStatus` `reconnecting` por mais de 5 s: faixa discreta na gaveta e ponto âmbar no
  sino ("Avisos pausados — reconectando…", ícone + palavra + cor `--warn`); nada de toast por isso. `blocked`/`stopped`: "Avisos
  parados. Entre de novo." (o fluxo de sessão existente).
- **RF20 — Resumo ao voltar.** No `resync` (ou ao voltar a aba depois de > 60 s), o painel pede `GET /v1/notices?after=<o
  último que viu>` e mostra **um** toast de resumo, sem som: "Enquanto você estava fora: 2 operações (1 compra, 1 venda) e
  1 ordem cancelada" com "Ver no sino". Os itens entram como não lidos; nenhum toast individual.

### Integrações

- **RF21 — Sala da equipe e "Equipe agora" (spec 011).** Aviso de compra ou venda de uma simulação com analista: se a sala
  ou a coluna compacta "Equipe agora" (ao lado do gráfico) está na tela, o balão do agente que puxou a decisão passa a
  falar o sinal no tom da RF17 ("Sinal de compra: LINK/USDT a 12,458 · vender no alvo 12,590 · sair se cair a 12,379"),
  com a linha fixa pequena embaixo, e ganha um destaque de 1,2 s (borda `--accent`, uma vez; com `prefers-reduced-motion`,
  só a borda). O texto do balão vem do MESMO catálogo do aviso (`notice-messages.ts`), nunca montado no painel; o agente vem
  da decisão já lida pela sala. Mexe em arquivos da 011: só com ela fechada (§10).
- **RF22 — Linha de pulso (spec 008).** O item "última decisão" ganha "Novo" por 10 s quando o aviso é daquela simulação, e
  o estado "Compra pedida · executa às 20:15" enquanto houver ordem pendente.

### Ficha do sinal: bem visual, de relance

Pedido do usuário: "precisa ser bem visual as recomendações de compra e venda". O sinal é sempre desenhado da MESMA forma
no toast, no item da gaveta, no cartão "Sinal em andamento" da tela da simulação e (em miniatura) no balão da equipe.

- **RF23 — A ficha.** Selo grande (56 px) com seta cheia + palavra em caixa alta **COMPRA** / **VENDA** / **COMPRADO** +
  cor semântica forte (`--buy` / `--sell`; texto do selo em `--on-buy`/`--on-sell`, contraste ≥ 4,5:1 nos dois temas),
  o **preço em destaque** (`--font-data`, 34 px), a hora e uma linha direta ("Vender no alvo 12,590 · sair se cair a
  12,379"). Nunca só cor: seta + palavra + cor em todo estado.
- **RF24 — A régua dos níveis.** Um eixo horizontal com três marcas rotuladas — **Proteção 12,379 (−0,63%)**, **Entrada
  12,458**, **Alvo 12,590 (+1,06%)** — a zona entre proteção e entrada preenchida de "perda possível" (`--sell` claro) e a
  zona entre entrada e alvo de "ganho possível" (`--buy` claro), o **cursor "agora"** (preço ao vivo) ou "saiu" (preço de
  saída, mesmo fora da faixa) e a legenda "Perda possível −0,63% · Ganho possível +1,06% · Ganho ÷ perda 1,7 : 1". Abaixo
  de 280 px de largura do contêiner (container query) a régua vira uma lista vertical (Alvo / Entrada / Proteção, borda da
  cor). `role="img"` com a descrição textual completa. Posições na régua são o ÚNICO uso de `Number` (desenho, como na 009);
  os textos são do servidor.
- **RF25 — Estados da ficha.** "Perto de comprar" (barra de progresso até a condição, RF18) → "Compra pedida" (sem preço
  ainda: "o preço sai às 20:30") → **COMPRA** executada (régua sem cursor) → **COMPRADO** (cursor no preço ao vivo, resultado
  "▲ +0,26% em andamento", distância até alvo e proteção) → **VENDA** (alvo, proteção ou estratégia; cursor "saiu" e resultado
  no saldo) | **Cancelada** (cinza, sem régua).
- **RF26 — O sinal no gráfico (camada "Níveis" e marcadores da 009).** Na tela da simulação: seta grande ▲/▼ com rótulo
  "COMPRA 12,458" / "VENDA 12,372" na vela, linhas de entrada (cheia), alvo (tracejada verde) e proteção (tracejada vermelha)
  com etiqueta de preço à direita, a faixa sombreada da operação (verde acima da entrada, vermelho abaixo) da vela de entrada
  até a saída (ou até agora) e a etiqueta "Agora 12,490". Cores por token, contraste ≥ 3:1 (contrato `contrast`), descrição
  textual no `role="img"` do gráfico. Reaproveita a camada "Stop e alvo" da 009 (renomeada na tela para "Níveis"); nada é
  calculado no painel.

### Para quem executa à mão (o app NÃO envia ordem)

Pedido do usuário: "porque quem tiver usando vai fazer isso manualmente" e "a não ser que você tenha uma forma rápida de já ir
para o link com a oferta montada para a Binance". A ficha ganha a seção recolhível **"Operar à mão"** (aberta no item da
gaveta; no toast, só o botão que a abre). Nada é inventado: cada número vem do que a simulação gravou ou do que a pessoa
digitou.

- **RF27 — Como a simulação executou.** "Ordem a mercado. Decidiu no fechamento das 20:15 e comprou pelo preço de abertura
  da vela das 20:15 (confirmado às 20:30). Preço de referência: 12,458." (de `orders`/`fills`).
- **RF28 — Quantidade.** "A simulação comprou **113,50 LINK** (≈ 1.414 USDT) com saldo de 10.000 USDT" (de `fills.quantity`
  e do saldo da simulação; o tamanho é o do motor — `computePositionSize` com `riskPerTrade` — e o do analista, quando há).
  Com o campo opcional **"Meu saldo"** (D12-A, guardado só no navegador), a proporção: "Com 2.000 USDT, a mesma proporção dá
  **22,70 LINK**" (multiplicação em `BigInt`, quantidade **para baixo** no passo do par). Ressalva fixa: "A quantidade real
  depende do seu saldo e da sua corretora."
- **RF29 — As três ordens.** Entrada (a mercado, ou limitada em 12,458), **alvo** (venda limitada 12,590) e **proteção**
  (stop 12,379), formatadas pelos filtros do par (`packages/market-data-crypto` `symbol-filters`: LINKUSDT tick 0,001 e passo
  0,01; preço no tick — alvo e proteção nunca arredondados a favor; quantidade para baixo). Na Binance, alvo e proteção
  podem ir juntos numa ordem OCO (texto informativo).
- **RF30 — Custo e líquido.** "Custo estimado ida e volta: 0,30% (taxa 0,10% + deslizamento 0,05% por lado, os da
  simulação)". "Ganho possível depois do custo: +0,76% · perda possível depois do custo: −0,93% · ganho ÷ perda 0,8 : 1"
  (frases do servidor, arredondadas contra o usuário).
- **RF31 — Quando desistir.** "A simulação compra a mercado e não desiste pelo preço. Para quem opera à mão: acima de
  **12,447** o ganho depois do custo já fica menor que a perda (este sinal entrou acima disso)." O servidor calcula o ponto
  de equilíbrio `(alvo + proteção) ÷ (2 + 2 × custo)` arredondado para baixo no tick; não é regra da simulação e a frase diz.
- **RF32 — Histórico ao lado.** "Últimos 183 dias, LINK/USDT 15 min, com taxas: **−14,3%** (com o analista) · acerto 1.420
  de 2.552 contra 50% da moeda ao ar" — do último backtest/walk-forward concluído da mesma versão, par e vela (sem nenhum:
  "Sem histórico deste par. Rode um backtest em Backtests.").
- **RF33 — Honestidade fixa.** "A simulação executa sem atraso e sem a oscilação de preço real. À mão haverá diferença
  (deslizamento e atraso) e você pode perder dinheiro. O AtivAdA não envia ordens e não tem chave da sua corretora."
- **RF34 — Atalhos para a corretora (D13-A).** Botão **"Abrir LINK/USDT na Binance"** (link só do par,
  `https://www.binance.com/pt-BR/trade/LINK_USDT`, nova aba, `rel="noopener noreferrer"`, NENHUM dado do usuário na URL: a
  Binance não documenta link com preço ou quantidade). Botões **"Copiar preço"**, **"Copiar quantidade"**, **"Copiar
  alvo"**, **"Copiar proteção"** e **"Copiar todas as ordens"** (texto com ponto decimal, o formato da corretora); retorno
  "Copiado" com ícone ✓ por 2 s e anúncio no `aria-live`. **Roteiro de 3 passos** na ficha: 1) abrir o par; 2) colar entrada
  e quantidade; 3) cadastrar alvo e proteção (ou OCO) — "Desista se o preço já passou de 12,447".

## 4. Requisitos não funcionais

- **RNF01 — Leigo em 5 segundos.** Título curto → estado (ícone + palavra + cor) → preço e hora → ação. Uma ideia por linha.
- **RNF02 — Acessibilidade.** Região `role="status"`/`aria-live="polite"` ÚNICA para os avisos (os toasts visuais são
  `aria-hidden` para não anunciar duas vezes); anuncia só aviso novo e troca de estado da ordem, nunca tick, contagem nem
  "há N s"; não anuncia o aviso da simulação que está na tela (o cartão dela já anuncia). Foco nunca é roubado pelo toast;
  F6/atalho "Alt+N" leva ao toast mais novo. Alvos de 44 px; contraste AA nos dois temas (contratos `contrast` e
  `touch-targets`); `prefers-reduced-motion` = aparecer sem deslizar; nenhum laço de animação.
- **RNF03 — Desempenho.** Nada por tick além do aviso antecipado (comparação de texto em `BigInt`, só nas simulações
  marcadas). A lista guarda 50 itens; o resumo é UMA chamada.
- **RNF04 — Privacidade.** Nada no `localStorage` além de preferências, ids de simulação silenciados, cursor do último lido e
  "já vi o balão". Chave por `sub` do token (opaco). Nenhum preço nem par guardado. Notificação sem dado pessoal.
- **RNF05 — Código.** Componente ≤ 40 linhas, arquivo ≤ 200, sem `style=`, CSS Modules + tokens, sem biblioteca nova, sem
  `Number(` em dinheiro.

## 5. Frases (catálogo fechado do servidor, `apps/api-ativada/src/notices/notice-messages.ts`)

| Código | Título | Frase |
|---|---|---|
| `entry.created` | Compra pedida | Executa pelo preço de abertura da vela das {abre}; a simulação confirma às {fecha}. |
| `entry.created.limit` | Compra pedida (limitada) | Executa se o preço chegar a {limite} até a vela das {validade}; senão, cancela. |
| `entry.filled` | Sinal de compra · executada | Sinal de compra: {par} a {preço} · vender no alvo {alvo} · sair se cair a {stop}. |
| `exit.target` | Sinal de venda · alvo | Sinal de venda: sair a {preço}. Chegou ao alvo de lucro. |
| `exit.stop` | Sinal de venda · proteção | Sinal de venda: sair a {preço}. Caiu até a saída de proteção ({stop}). |
| `exit.signal` | Sinal de venda | Sinal de venda: sair a {preço}. A estratégia virou para vender. |
| `exit.command` | Sinal de venda · meta | Sinal de venda: sair a {preço}. A meta chegou ao fim. |
| `exit.gap` | Sinal de venda · dados | Sinal de venda: sair a {preço}. Faltaram dados do mercado. |
| `line.fixed` | — | Simulação com dinheiro fictício · tendência, não promessa · acerto {de quem}: {acertos} de {contadas} (cara ou coroa = 50%) |
| `cancel.opposite_signal` | Compra cancelada | A estratégia mudou de ideia antes de executar. |
| `cancel.command` | Ordem cancelada | A simulação foi parada antes de executar. |
| `expire.limit` | Compra cancelada | O preço não chegou ao limite de {limite} a tempo. |
| `expire.gap` | Ordem cancelada | Faltaram dados do mercado na vela em que ia executar. |
| `reject.zero_atr` | Compra não feita | O mercado ficou parado demais para calcular a proteção. |
| `reject.below_min_notional` | Compra não feita | O valor ficou abaixo do mínimo que a corretora aceita. |
| `reject.invalid_stop` | Compra não feita | A saída de proteção ficaria acima do preço de compra. |
| `blocked.analyst` | Compra barrada | O analista pausou as compras: {motivo}. (spec 007) |
| `blocked.minimum_profit` | Compra barrada | O lucro esperado não cobria as taxas. (spec 013) |
| `run.stalled` / `run.resumed` | Simulação parada / voltou | A simulação não decidiu a vela das {hora}. / Voltou a decidir. |
| `run.waiting` | Aguardando dados | A simulação espera dados do mercado para continuar. |
| `goal.*` | Meta alcançada / encerrada | (as frases da meta, T4b.4) |
| `price_alert.fired` | Alerta de preço | {par} passou de {preço}. |
| fixa (painel) | — | Tendência, não promessa. · Simulação com dinheiro fictício. Não é recomendação. |
| `manual.how` | Como a simulação executou | Ordem a mercado. Decidiu no fechamento das {fecha} e comprou pelo preço de abertura da vela das {abre}. |
| `manual.quantity` | Quantidade | A simulação comprou {qtd} {moeda} (≈ {valor} USDT) com saldo de {saldo} USDT. A quantidade real depende do seu saldo e da sua corretora. |
| `manual.cost` | Custo | Custo estimado ida e volta: {custo} (taxa e deslizamento da simulação). |
| `manual.net` | Depois do custo | Ganho possível {ganho} · perda possível {perda} · ganho ÷ perda {razão}. |
| `manual.giveUp` | Quando desistir | A simulação compra a mercado e não desiste pelo preço. Acima de {equilíbrio} o ganho depois do custo fica menor que a perda. |
| `manual.history` | Histórico | Últimos {dias} dias, {par} {vela}, com taxas: {líquido} · acerto {acertos} de {contadas} contra 50% da moeda ao ar. |
| `manual.honesty` | — | A simulação executa sem atraso e sem a oscilação de preço real. À mão haverá diferença (deslizamento e atraso) e você pode perder dinheiro. O AtivAdA não envia ordens e não tem chave da sua corretora. |

Varredura de palavras proibidas no contrato: "você deve", "compre agora", "venda agora", "garant", "oportunidade",
"lucro certo", "recomend" (fora do "Não é recomendação"), "certeza", "ATR", "stop" (fora do código). "Sinal de compra",
"Sinal de venda", "vender no alvo" e "sair se cair a" são permitidos: o sujeito é o sinal da estratégia.

## 6. Fora do escopo

Telegram (já existe, T4.5); e-mail; push com o painel fechado (exige service worker com Push API e servidor de push:
outra spec); avisos de backtest; mudar o motor, o `run-recording`, a regra do analista ou o placar; avisos por preço com o
painel fechado.

## 7. Critérios de aceite

1. Com o painel noutra tela, a compra da simulação vira toast "Compra pedida" e, na vela seguinte, o MESMO toast vira
   "COMPRA · Executada · 12,458" com a régua (sem recarregar; um anúncio por troca).
2. Cancelamento por sinal contrário mostra "Compra cancelada · A estratégia mudou de ideia antes de executar." em cinza
   com o ícone de cancelado, no toast e no sino.
3. Aba escondida: "(2) AtivAdA"; com notificação ativada, uma notificação por aviso, nenhuma duplicada com duas abas.
4. Sino a 375 px fora do menu; gaveta com foco preso, Esc devolve o foco; "Marcar todos como lidos" zera o contador.
5. Socket derrubado e religado: faixa "Avisos pausados" e, na volta, UM resumo com a contagem certa.
6. Preferências: desligar "Avisar quando comprar ou vender" tira toast, som e notificação, mas o sino continua contando.
7. Nenhum texto do catálogo com palavra proibida; contraste AA e 44 px nos dois temas; zero `style=`.
8. A ficha mostra COMPRA/VENDA com seta, palavra, cor e preço; a régua tem proteção, entrada e alvo com %, as duas zonas e o
   cursor; a 280 px vira lista vertical; a descrição textual lê os três níveis.
9. "Operar à mão": quantidade da simulação e proporcional ao "Meu saldo" (para baixo no passo do par), três ordens no tick,
   custo 0,30%, líquido depois do custo, ponto de desistência, histórico líquido e acerto, a frase de honestidade; "Copiar
   todas as ordens" copia o texto com ponto decimal; o link da Binance não leva nenhum dado do usuário.

## 8. Riscos

- **Toast demais em vela curta** (15 min com várias simulações): teto de 3, recolhimento e silenciar por simulação.
- **"Pedida" que dura uma vela inteira** pode parecer travada: a frase diz quando confirma (o fechamento da vela seguinte).
- **Acerto que assusta** (a estratégia acerta 47,9%, abaixo da moeda): é verdade e é o ponto. A frase não esconde.
- **Percentual do exemplo**: −0,13% é do saldo da simulação (o preço caiu 0,69%; 113,50 LINK × 0,086 + taxas ≈ 12,6 USDT
  de 10.000); o servidor manda a base na frase.
- **Execução manual perde dinheiro**: a estratégia sozinha perdeu 50,7% e, com o analista, 14,3% em 183 dias de LINK 15 min
  (spec 007, evidence D11, com taxas). A ficha mostra isso ao lado de cada sinal (RF32); "Operar à mão" não pode parecer
  convite.
- **Ganho ÷ perda depois do custo abaixo de 1** (0,8 : 1 no exemplo): a ficha mostra os dois números; esconder seria mentir.
- **Copiar valor errado**: o texto copiado sai do mesmo número formatado pelo filtro do par, com teste por par.
- **`completesScore`** muda a rota da spec 008 (aditivo): conflito se a 008 estiver em execução por outro executor.
- **`orders` sem o candle da mudança de estado**: T0.1 confere; se faltar, cancelamento usa o candle do `balance` do passo.

## 9. Decisões que o usuário precisa tomar (A = recomendado)

1. **Ciclo da ordem (D1):** A) um aviso que muda de estado (pedida → executada/cancelada) · B) um aviso por estado.
   *Sem resposta: A.*
2. **Onde guardar preferências e "lido" (D2):** A) no aparelho (`localStorage`, sem migration; trocar de computador
   volta ao padrão) · B) na conta (tabela nova `notice_preferences` com migration — **exige autorização**). *Sem resposta: A.*
3. **Fonte dos avisos (D3):** A) rota nova só leitura `GET /v1/notices` com frases do servidor · B) o painel monta de
   `trades`, `live-status` e `price-alerts/fired` (mais chamadas, frases no painel). *Sem resposta: A.*
4. **Aviso "perto de comprar" (D4):** A) ligado só para a simulação marcada "Avisar antes de comprar" · B) ligado para
   todas · C) não ter. *Sem resposta: A.*
5. **Acerto em cada aviso (D5):** A) uma linha em todo aviso de compra, venda e "perto de" · B) só no detalhe da gaveta.
   *Sem resposta: A.*
6. **Preferências (D6):** A) três interruptores · B) cinco tipos (compras, vendas, proteção/alvo, analista, parada) em
   "Mais opções". *Sem resposta: A.*
7. **Tempo do toast (D7):** A) some em 8 s, pausa no mouse e no foco · B) fica até fechar. *Sem resposta: A.*
8. **Toast na tela da própria simulação (D8):** A) não (o gráfico e a linha de pulso já mostram; só o sino conta) · B) sim.
   *Sem resposta: A.*
9. **Texto da notificação do navegador (D9):** A) com par e preço ("▲ Sinal de compra · LINK/USDT a 12,458") · B) genérico
   ("Novo aviso de simulação"), para a tela bloqueada não mostrar. *Sem resposta: A.*
10. **"Compra barrada" (D10):** A) mostrar quando a 007 (analista) e a 013 (lucro mínimo) gravarem o motivo · B) fora desta
    spec. *Sem resposta: A (a peça só liga quando a dependência existir).*
11. **Tom do sinal (D11):** A) direto e curto, com o sujeito no sinal: "Sinal de compra: LINK/USDT a 12,458 · vender no
    alvo 12,590 · sair se cair a 12,379" e "Sinal de venda: sair a 12,372", com a linha fixa (fictício · tendência, não
    promessa · acerto X de N, cara ou coroa = 50%) · B) narrado no passado: "A estratégia comprou a 12,458" (mais distante,
    menos útil para quem quer agir). *Sem resposta: A* (pedido do usuário: "compre isso, vende nesse valor"; o imperativo
    para a pessoa — "compre", "você deve" — continua proibido).
12. **Quantidade para quem opera à mão (D12):** A) mostrar a quantidade da simulação e, com o campo opcional "Meu saldo"
    (só no navegador), a mesma proporção para o saldo da pessoa, com a ressalva · B) só a quantidade da simulação · C) não
    mostrar quantidade. *Sem resposta: A.*
13. **Atalho para a corretora (D13):** A) link do par na Binance + botões de copiar + roteiro de 3 passos (sem chave, sem
    envio, sem risco novo) · B) integração por API com chave de leitura/negociação (spec 002) — **exige autorização expressa
    e fica fora desta spec**. *Sem resposta: A.*
14. **Onde a ficha completa aparece (D14):** A) toast com a ficha e a régua (sem "Operar à mão", que abre no sino); gaveta e
    tela da simulação com tudo · B) toast só com a linha direta, ficha só na gaveta. *Sem resposta: A.*
15. **Nome da camada no gráfico (D15):** A) "Níveis" (entrada, alvo, proteção e a faixa da operação), ligada por padrão na
    simulação ao vivo · B) manter "Stop e alvo" desligada como na 009. *Sem resposta: A* (muda o padrão da 009: coordenar).
16. **"Quando desistir" (D16):** A) mostrar o ponto de equilíbrio depois do custo (RF31), dizendo que não é regra da
    simulação · B) não mostrar. *Sem resposta: A.*

## 10. O que exige autorização ou coordenação

| O quê | Por quê | Quando |
|---|---|---|
| Migration `notice_preferences` | Só com D2-B | T1.4 (só existe com D2-B) |
| Campo aditivo `completesScore` em `live-status` | Mexe na rota da spec 008 | T1.3: parar se a 008 tiver outro executor |
| `blocked.analyst` / `blocked.minimum_profit` | Lê dado das specs 007 e 013 | Só depois das Fases que gravam |
| Destaque na sala (RF21) e na linha de pulso (RF22) | Arquivos das specs 011 e 008 | Fase 4, com elas fechadas |
| Camada "Níveis" ligada por padrão e faixa da operação (RF26, D15) | Arquivos da spec 009 | T4.1, com a 009 fechada |
| Integração por API com a corretora (D13-B) | Chave da pessoa, envio de ordem (spec 002) | Fora desta spec; nunca sem autorização expressa |

**Dependências.** Specs 005 (seleção `?operacao=`), 008 (`live-status`, linha de pulso) e 009 (`projections`) prontas;
007 e 013 opcionais (D10). Esta spec **não muda o motor, o `run-recording` nem o stream**, não adiciona dependência e não
cria migration (salvo D2-B).
