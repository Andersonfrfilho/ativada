# Spec 011 — Adendo: o escritório de investimento (crachás, mesas, movimento)

> Adendo da spec 011 (não a substitui). Vale tudo de `spec.md` §4 (honestidade, movimento só em tokens, leve, estado =
> ícone + palavra + cor) e as decisões D1–D8 já respondidas em `evidence.md`. Preview navegável:
> `docs/preview/escritorio/index.html` (cenas por `#cena=…`), capturas em `docs/preview/escritorio/capturas/`.

## 1. Pedido

Em 2026-10-16 o usuário (Anderson, leigo) pediu, nas palavras dele: "add os crachás, melhore o design da sala, add mesas,
computadores, faça eles se mexerem no ambiente como se fosse um escritório de investimento". Logo depois: "monte um preview
da equipe perto dos gráficos dando opiniões".

Hoje a sala v1 (`apps/frontend-ativada/src/runs/team-room/`) mostra bonequinhos num piso isométrico com balões e
plaquinhas, e a coluna "Equipe agora" fica ao lado do gráfico. O que falta: **quem é quem** (crachá com cargo, selo do
auditor, ID e versão da regra), um **lugar** que pareça uma mesa de operações (mesas, monitores, telão, quadro, relógio) e
**movimento com propósito** (a equipe leva a opinião até quem decide).

## 2. Objetivo

Duas composições com o MESMO conteúdo e as MESMAS frases do servidor:

1. **Gráfico + equipe** (a que o usuário vai usar no dia a dia; primeira cena do preview, `#cena=grafico-equipe`): o
   gráfico de velas é o protagonista (≈ 2/3 da largura) e a equipe fica **colada** à direita (≈ 1/3; logo abaixo no
   celular). Cada agente tem crachá, mesinha com monitor em miniatura e balão com voto, motivo curto e o preço; uma linha
   fina com seta liga o balão à vela ou ao nível comentado. Passar o mouse (ou ← →) numa vela troca os balões para o que
   cada um disse naquela vela. Abaixo do gráfico, a **ficha do sinal** (spec 014 RF23/RF24) com a régua
   Proteção · Entrada · Alvo e o cursor "agora".
2. **Escritório** (o cartão "Sala da equipe" da v1, redesenhado): vista frontal de uma mesa de operações com quatro mesas
   de especialistas (monitor com o gráfico de cada um), telão na parede com o gráfico da simulação, relógio com o próximo
   fechamento, quadro de avisos (sinal e travas), a mesa de reunião da Alice, a mesa do Otávio com a prancheta de Wilson,
   o canto do café e a "Sala dos modelos · em breve" (vidro) com Nina, Lucas e Clara. Quando a vela fecha, quem tem opinião
   levanta, leva a opinião até a mesa da Alice e volta; a Alice decide; o Otávio confere.

## 3. Equipe e crachás

| Agente | Cargo | ID · versão | Selo do auditor (A7 + vocabulário da 009) | O que faz (frase da ficha) |
|---|---|---|---|---|
| Tiago | Especialista em Tendência | `trend` · Tendência v1 | ↘ Abaixo da moeda ao ar (47,44%, 5.181 de 10.921) | médias (EMA 9 e 21), MACD, máxima de 20 velas |
| Renata | Especialista em Reversão | `reversion` · Reversão v1 | ✓ Acima da moeda ao ar (55,64%, 1.420 de 2.552), peso 0,03 | RSI 14 e bandas de Bollinger 20 |
| Vitor | Especialista em Volume | `volume` · Volume v1 | ↘ Abaixo da moeda ao ar (48,27%, 8.025 de 16.625) | OBV contra a EMA 20 dele |
| Sofia | Especialista em Sentimento | `sentiment` · Sentimento v1 | = Igual à moeda ao ar (49,95%, 2.569 de 5.143) | Fear & Greed 25/75 |
| Alice | Analista de Risco sênior | `risk` · Risco v1 (`analyst-1`) | ◐ Decide · não prevê | pausa, tamanho e saída; respeita as cinco travas |
| Otávio | Auditor | `auditor` · Auditor v1 (Wilson 95%) | 🔍 Mede · não vota | mede todos contra cara ou coroa (50%) |
| Nina | Analista de Notícias | — | ◷ Em breve · modelo | agente de modelo; ainda não existe |
| Lucas | Analista Estatístico | — | ◷ Em breve · modelo | agente de modelo; ainda não existe |
| Clara | Repórter | — | ◷ Em breve · modelo | agente de modelo; ainda não existe |

- **E-RF01 — Crachá compacto sempre visível.** Na mesa (escritório) ou na linha (coluna): retrato em SVG, nome, cargo,
  selo (ícone + palavra + cor) e `ID · versão` em fonte de dados. "Em observação" (menos de 30 contadas, A7) mostra o
  selo tracejado com relógio e "— (N contadas, precisa de 30)" na ficha.
- **E-RF02 — Ficha curta.** Ao passar o mouse no crachá (escritório) ou ao focar/abrir "Ficha" (coluna e lista): o que
  faz, acerto "N de M" + peso ou "não vota", última opinião (voto + motivo) e ID · versão. Esc fecha.
- **E-RF03 — Selo vem do servidor.** O selo é o `verdict` do auditor (A7 da 007: `above | even | below | too_few`); o
  painel só troca a palavra ("provou valor" → "Acima da moeda ao ar", a mesma da `ProjectionHistoryCard` da 009) e mantém
  "não vota" visível. Alice e Otávio não têm selo de moeda (não preveem).
- **E-RF04 — "Em breve".** Agentes de modelo aparecem só atrás do vidro, apagados, com cadeira vazia tracejada; **nunca
  falam, nunca votam, nunca aparecem na coluna do gráfico**. Somem da tela se o usuário escolher D-E4 B.

## 4. Gráfico + equipe (composição principal)

- **E-RF05 — Proporção.** ≥ 900 px de largura útil: grade `2fr / 1fr` (equipe com no mínimo 300 px; medida no preview:
  gráfico 64%, equipe 33%). < 900 px: uma coluna — gráfico, legenda, ficha do sinal, equipe. A altura da coluna da equipe
  não passa da do gráfico + ficha (linhas compactas: mesinha 60 × 50 px ocupando duas linhas da grade).
- **E-RF06 — Gráfico.** O `CandleCanvas` da 009 (sem mudança de dados): velas, volume, EMA 9/21, bandas, marcadores
  "▲ Compra 12,870" / "▼ Venda 13,013 · alvo" com faixa na vela e ponto com halo, linhas Entrada (cheia), Alvo e Proteção
  (tracejadas) com etiqueta à direita, as zonas de ganho e perda possíveis desde a vela de entrada, a linha "agora" e a
  vela em formação oca. Etiqueta de eixo que cairia sob uma etiqueta de nível é omitida.
- **E-RF07 — Balão por agente.** Voto (chip), motivo curto (§5 da spec 011), o gatilho quando é neutro ("Vota a favor se
  fechar abaixo de 12,862", frase do `NextTriggersBlock`/camada "Níveis") e o rodapé com o número que ele olha
  ("banda inferior 12,862 · fechou a 12,873", "EMA 9 12,928 · EMA 21 12,948", "volume da vela 9,8 mil"). Alice: postura +
  teto de risco + motivo. Otávio: "A Reversão acerta 55,64% (1.420 de 2.552); as outras não passam de cara ou coroa."
  Quem não vota tem balão tracejado e "não vota".
- **E-RF08 — Linhas de ligação.** Uma por agente que comenta algo do gráfico: Renata → banda inferior da vela, Tiago →
  EMA 9, Vitor → barra de volume, Alice → nível de proteção (comprado) ou fechamento. Sofia (índice diário) e Otávio não
  têm linha. Tracejadas e finas (1,3 px, `--ink-3`), seta na ponta do gráfico; a linha do agente sob o mouse/foco fica
  cheia em `--accent`. Desenhadas num SVG por cima da grade, `aria-hidden`, recalculadas no redimensionamento. < 900 px:
  sem linhas; o balão diz "· vela das 03:15".
- **E-RF09 — Vela apontada.** Mouse ou teclado (←/→, Home/End, Esc, a mesma parada de Tab do gráfico da 009) apontam
  uma vela: o cabeçalho vira "vela apontada: 22:30 · Esc volta a agora", os balões mostram as falas gravadas daquela vela
  e as linhas vão para ela. Anúncio `aria-live` 400 ms depois da última tecla ("Vela das 22:15: Renata neutro; Alice
  CAUTELA."). Reaproveita `pointedOpenTime` do contexto `TeamAside` (evidência de 2026-10-16) — nenhum estado novo.
- **E-RF10 — Ficha do sinal.** Abaixo do gráfico, a ficha da 014 (selo COMPRA 72 px, preço 30 px em `--font-data`,
  "Executada às 03:00 · ▲ +0,22% em andamento · puxado pela Renata (Reversão) · Alice: MODERADA, ½ do risco", "Vender no
  alvo 13,007 (+1,06%) · sair se cair a 12,789 (−0,63%)") e a régua (zona de perda `--sell` claro, de ganho `--buy` claro,
  marcas rotuladas e o cursor "agora 12,898"). Sem posição: a ficha mostra o estado "Perto de comprar" da 014 ou some.

## 5. Escritório

- **E-RF11 — Planta (vista frontal, D-E1 A).** Palco com proporção fixa 1200 × 760 em unidades; tudo posicionado em
  unidades e escalado por `container-type: inline-size` (textos em `cqw` com `clamp`). Camadas: parede/piso/telão/quadro
  (SVG) → especialistas sentados → frentes das mesas e monitores → crachás → quem caminha → mesa da Alice e mesa do Otávio
  → Alice, Otávio e crachás da frente → luz → falas → ficha.
- **E-RF12 — Monitores com propósito.** Tiago: velas + EMA 9 × 21; Renata: preço com bandas + faixa do RSI (30/70);
  Vitor: barras de volume + OBV; Sofia: medidor do Fear & Greed com o número (ou "sem leitura"); Otávio: barras de Wilson.
  Telão: o gráfico da simulação (o mesmo dado do `CandleCanvas`, em miniatura) com "vela das HH:MM · fechou a X".
- **E-RF13 — Quadro de avisos e relógio.** Quadro: "SINAL" (▲ Compra a 12,458 / nenhum nesta vela / ainda sem decisões),
  "TRAVAS" com cinco cadeados (o ativo fechado em `--warn` e a frase da A17) e a meta. Relógio: ponteiros + "PRÓXIMO
  FECHAMENTO 14:15" (de `nextDecisionAt`, no fuso do usuário).
- **E-RF14 — Luz por estado.** Faixa de luz no teto + lavagem suave: calmo (neutro), vela fechando (`--accent`, pisca uma
  vez), sinal de compra (`--buy`), pausa por trava (`--warn` em todo o palco). Nunca a única pista: a placa e o quadro dizem
  a mesma coisa em palavras.
- **E-RF15 — Escritório com o gráfico (D8).** O seletor "Escritório | Sala com o gráfico" aumenta o telão (≈ 800 × 214
  unidades, com volume e bandas); os balões viram chips de uma linha sobre cada mesa e uma linha tracejada liga cada chip ao
  ponto do telão que ele comenta (mesma regra da E-RF08).
- **E-RF16 — Lista equivalente.** O palco inteiro é `aria-hidden` e sem focável. Abaixo: "Crachás da equipe" (botões de
  44 px que abrem a ficha; foco ou mouse acendem o crachá e o bonequinho no palco) e "Falas desta vela em texto" (RF11 da
  spec 011, mais o sinal, a Alice, o Otávio e as travas).
- **E-RF17 — 375 px (D-E5 A).** Abaixo de 900 px de largura útil o palco some e entram o **telão compacto** (gráfico em
  miniatura + sinal ou PAUSA) e a lista de crachás com a fala atual dentro de cada crachá. Motivo: a 375 px o palco
  escalado deixaria o texto com ~4 px; rolar a cena na horizontal esconde a mesa da Alice, que é onde a decisão acontece.

## 6. Movimento com propósito

Sequência da vela nova no escritório (atrasos em `team-room-timeline.constant.ts`, durações só por token):

| t (ms) | O quê | Token |
|---|---|---|
| 0 | luz do teto pisca uma vez; relógio troca a hora; vela nova cresce no telão | `--motion-medium`, `--motion-fast` |
| 250 | cada especialista olha o próprio monitor (cabeça 9°; tela acende) | 300 ms |
| 400 + 50·i | quem tem opinião levanta, sai pelo vão entre as mesas, vai até a mesa da Alice, deixa a ficha do voto (ícone + palavra) e volta | `--motion-walk` (1750 ms, novo) |
| ≈ 1.425 | Alice decide: placa da postura aparece (PAUSA com braço erguido na trava) | `--motion-fast` |
| ≈ 1.625 | Otávio confere a prancheta (✓) e o chip "Acima da moeda ao ar: Renata" | `--motion-medium` |
| ≈ 1.845 | balão da Alice (postura, motivo, ¼/½) | `--motion-medium` |
| chegada de cada um | balão dele acima da mesa | `--motion-fast` |
| sinal | a Renata levanta a placa "▲ COMPRA 12,458 · vender no alvo · sair se cair a"; o telão pisca Entrada/Alvo/Proteção duas vezes | `--motion-fast`, 2 × `--motion-medium` |

- Fim medido no preview: **2.460 ms** (vela nova e sinal), 28 e 32 elementos animados (teto 60). Auditoria ≈ 1,4 s;
  primeiro uso ≈ 2,1 s; gráfico + equipe ≈ 1,2 s (vela em formação cresce, a anterior "fecha", os balões saem dos "•••"
  um a um a cada 140 ms, as linhas aparecem junto).
- Quem **não** levanta: "em observação" (fica sentado de braços cruzados), "sem leitura" (fica sentado, balão tracejado).
- **Ocioso**: depois da sequência, por ≈ 3,6 s, Tiago digita, Vitor olha o relógio, Sofia toma café, Alice olha a mesa
  — cada um uma vez — e tudo para. Nada em laço infinito.
- **Controles**: "Repetir a vela nova", "Pausar/Continuar" (pausa todas as animações da página) e "Animação:
  ligada/desligada" (lembrada como hoje). `prefers-reduced-motion: reduce` ou animação desligada = estado final no primeiro
  quadro, sem caminhar. Abrir a tela, trocar de aba ou rever vela: estado final (RF09 da 011).
- **Fora da tela**: `IntersectionObserver` (15%) pausa; `visibilitychange` (aba oculta) pausa; volta = continua.
- Implementação: Web Animations API (`element.animate`, `fill: 'both'`) para tudo, inclusive o `z-index` de quem passa na
  frente das mesas; assim pausar é `getAnimations().forEach(pause)`. Sem `requestAnimationFrame` em laço, sem biblioteca.

## 7. Tokens novos (em `global.css`, claro e escuro)

`--motion-walk` (1750ms); `--office-wall`, `--office-seam`, `--office-floor`, `--office-floor-line`, `--desk-top`,
`--desk-front`, `--desk-edge`, `--table-top`, `--table-front`, `--chair`, `--glass`, `--plant`, `--plant-2`, `--pot`,
`--lanyard` — todos `color-mix` dos tokens existentes, então valem nos dois temas. Telas (sempre escuras nos dois temas):
`--bezel`, `--screen`, `--screen-grid`, `--screen-ink`, `--screen-ink-2`, `--screen-up`, `--screen-down`,
`--screen-accent`, `--screen-warn` (contraste ≥ 4,5:1 do texto sobre `--screen` a provar em `contrast.contract.ts`).
Luz: `--light`, `--light-strip` trocados por `data-light` no palco. Posições: o preview usa variáveis CSS por elemento;
no painel viram classes por lugar (`seat-trend`, `spot-trend`, …), porque os lugares são fixos — sem `style=`.

## 8. Honestidade e acessibilidade (o que muda pouco)

- Toda fala é frase do servidor (catálogos: §5 da 011, A17 da 007, RF17 da 014, `NextTriggersBlock` da 008). O painel só
  junta frases com "·" e formata números. Nenhum balão inventado; Nina, Lucas e Clara nunca falam.
- Linha fixa no topo do cartão: **"Simulação com dinheiro fictício · tendência, não promessa"**; rodapé da 011 mantido.
- Estado é ícone + palavra + cor (voto, selo, postura, placa, cadeado). Alvos de 44 px (o "Ficha" da coluna tem área de
  toque de 44 px por pseudo-elemento; provar em `touch-targets.contract.ts`). Foco visível em crachás e no gráfico.

## 9. Decisões A/B (A = recomendado)

| # | Decisão | A (recomendado) | B | Por quê A |
|---|---|---|---|---|
| D-E1 | Planta | **Vista frontal** com profundidade leve (duas fileiras) | Planta isométrica (estilo Habbo, como a v1) | Texto e crachás ficam retos e legíveis; caminhar vira translação simples; o telão cabe na parede |
| D-E2 | Crachá | **Sempre visível compacto** (nome, cargo, selo, ID · versão) + ficha ao passar o mouse/focar | Só ao passar o mouse | O selo é a informação que mais protege o leigo ("não vota"); escondê-lo atrás do mouse some no celular |
| D-E3 | Movimento | **Caminham até a mesa da Alice e voltam** (só na vela nova, ≤ 2,5 s) | Só gesticulam na mesa | É o "escritório se mexendo" do pedido e mostra o fluxo opinião → decisão; com B a sequência cai para ≈ 1 s |
| D-E4 | "Em breve" | **Mostrar** Nina, Lucas e Clara atrás do vidro, apagados, sem fala | Esconder até existirem | O usuário listou os três; o vidro diz "ainda não" sem prometer nada. B se o vidro parecer promessa |
| D-E5 | 375 px | **Lista de crachás + telão compacto** (sem cena) | Cena rolável na horizontal | Ver §5 E-RF17 |
| D-E6 | Tela principal | **Gráfico + equipe** como composição padrão do detalhe; o escritório fica no cartão "Sala da equipe" abaixo | Escritório no topo | O gráfico é o protagonista (pedido de 2026-10-16); o escritório é a vista "de bastidor" |
| D-E7 | Linhas de ligação | **Tracejadas finas, acesas só na linha em foco** | Sem linhas, só "vela das HH:MM" no balão | Sem a linha o leigo não sabe para onde o agente olha; acesa só uma por vez para não virar teia |
| D-E8 | Alice na trava | **Placa PAUSA erguida + luz âmbar** | Só a placa | Pedido explícito; a luz nunca é a única pista |

Sem resposta do usuário: execução com todas em A.

## 10. Fora do escopo

Mudança de regra (`analyst-1`, votos, pesos, travas), rota ou consulta nova, migration, som, arrastar bonequinho,
personalização de avatar, agentes de modelo de verdade (Nina, Lucas, Clara), ordem real.

## 11. Dependências e dados

- Crachá com acerto **por especialista**, selo por `verdict`, postura da Alice e travas: dependem da spec 007 (Fases 2 e
  3: `GET /v1/runs/:runId/analyst` e `/analyst/decisions`). Até lá vale a regra da v1: o selo mostra "em observação: o
  auditor ainda não mede por especialista" e a cadeira da Alice mostra o "Resumo do placar da estratégia".
- Ficha do sinal e frase do sinal no balão: spec 014 (`notice-messages.ts`, RF17/RF21/RF23/RF24).
- Gráfico, marcadores e níveis: specs 009 e 011 (camada "Níveis", `pointedOpenTime`), sem consulta nova.

## 12. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| O escritório parece jogo e o leigo lê "a equipe garante" | Decisão com dinheiro real | Linha fixa no topo, "não vota" visível, selos do auditor, nada verde na postura |
| Linhas de ligação viram teia em cima do gráfico | Gráfico perde o protagonismo | Tracejadas finas, só uma acesa; < 900 px somem |
| Coluna da equipe mais alta que o gráfico | Sobra vazio à esquerda (pendência da v1) | Linhas compactas; a ficha do sinal vai abaixo do gráfico para equilibrar (preview: diferença < 40 px) |
| Caminhada a cada 15 min cansa | Usuário desliga | Só na vela nova, ≤ 2,5 s, ocioso para sozinho, botão e `prefers-reduced-motion` |
| Muitos SVGs no celular | Quadro travado | No celular não há palco; no desktop ≤ 32 elementos animados por sequência, só `transform`/`opacity` |
| Selo "Acima da moeda" lido como promessa | Confiança indevida | A ficha diz "N de M" e a janela; a frase do Otávio diz que as outras não passam de cara ou coroa |
| "Em breve" lido como promessa de recurso | Expectativa | D-E4 B disponível; nenhum texto diz quando |

## 13. Critérios de aceite

1. `#cena=grafico-equipe` a 1280 px: gráfico ≥ 60% e equipe 30–35% da largura; nenhum balão, crachá ou etiqueta sobreposto;
   a 375 px uma coluna, sem rolagem horizontal; dois temas.
2. Apontar uma vela (mouse e teclado) troca os seis balões e as linhas para aquela vela; Esc volta a "agora"; um anúncio
   `aria-live` por parada.
3. Escritório: sequência da vela nova ≤ 2.500 ms e ≤ 60 elementos animados (contrato com relógio falso); estado final igual
   com animação desligada e com `prefers-reduced-motion`; nada anima depois de ≈ 6,5 s; pausa fora da tela e com aba oculta.
4. Palco `aria-hidden` sem focável; lista de crachás e "Falas desta vela em texto" iguais ao palco; crachás com 44 px.
5. Varredura das frases novas de interface (§3, §4, §5) sem palavra proibida (RNF01 da 011).
6. Contraste dos pares novos (telas, crachás, selos, placas) nos dois temas.

## 14. Tasks (modelo por fase, `model-economy.md`)

### Fase 1 — Composição "Gráfico + equipe"
> 🤖 Modelo: `sonnet` (T1.3 é `haiku`)

- **T1.1** `CompactTeam` vira linhas com mesinha SVG, crachá compacto e "Ficha" (E-RF01, E-RF02, E-RF07). Aceite: contrato
  `team-beside-chart` estendido + `touch-targets`.
- **T1.2** Linhas de ligação (`TeamLeaders`, SVG sobre a grade; E-RF08, E-RF09) a partir da geometria do `ChartSurface`.
  Aceite: contrato com superfície falsa (pontos certos por agente; < 900 px sem linhas).
- **T1.3** Ficha do sinal abaixo do gráfico reaproveitando o componente da 014 (E-RF10). Aceite: contrato + `tsc`.

### Fase 2 — Escritório
> 🤖 Modelo: `sonnet` (T2.1 é `haiku`)

- **T2.1** Tokens novos em `global.css` + pares em `contrast.contract.ts` (§7). Aceite: `contrast`, `design-review`.
- **T2.2** Palco frontal (`OfficeStage`: parede, telão, quadro, relógio, mesas, monitores, vidro; E-RF11–E-RF15).
- **T2.3** Crachás no palco + lista de crachás focável (E-RF01–E-RF04, E-RF16, E-RF17).
- **T2.4** Sequência com Web Animations (`useOfficeSequence`, `team-room-timeline.constant.ts`; §6). Aceite: contrato com
  relógio falso (≤ 2.500 ms, ≤ 60 alvos, estado final sem animação, pausa por `IntersectionObserver`/aba).

### Fase 3 — Revisão
> 🤖 Modelo: `sonnet`

- **T3.1** Capturas 1280/375 × claro/escuro do app real no `evidence.md`; varredura de palavras proibidas.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute o adendo specs/011-sala-da-equipe/escritorio.md (leia também spec.md, plan.md e
evidence.md da 011 e abra docs/preview/escritorio/index.html antes de começar). Uma task por vez, na ordem do §14.
Modelos: Fase 1 → executor model=sonnet (T1.3 → haiku) · Fase 2 → executor model=sonnet (T2.1 → haiku) ·
Fase 3 → executor model=sonnet · revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com tsc do painel + bun run --cwd apps/frontend-ativada test + commit isolado, evidência em evidence.md.
Só apps/frontend-ativada; nada de api, worker, packages, migration ou dependência nova.
Pare e pergunte antes de: mexer no contrato da spec 007/014, qualquer decisão D-E1–D-E8 diferente de A, deploy.
```
