# Spec 011 — Sala da equipe (os agentes do analista em tela, com balões de fala)

## 1. Problema

Em 2026-10-15 o usuário (leigo em investimento) pediu, nas palavras dele: "add animações nos agentes em tela com as
opiniões aparecendo em balões, igual fizeram no projeto Habbo". A spec 007 já desenha **quem** opina e **como** se decide:
quatro especialistas (Tendência, Reversão, Volume, Sentimento), o analista de risco sênior e o auditor de acertos. Mas na
tela da 007 isso vira uma tabela (`AnalystTeamTable`) e um cartão de texto: correto, completo e frio. Para quem não lê
tabela de indicador, fica difícil ver **quem disse o quê, quem conta e por que o analista decidiu assim**.

O que os números da casa dizem (e que a sala não pode esconder — `specs/007-analista-de-risco-senior/evidence.md`, T0.2,
LINK/USDT 15 min, últimos 183 dias):

| Item | Acerto do lado | Wilson 95% | Situação (ADR 0002, A7) |
|---|---|---|---|
| Tendência | 47,44% (5.181 de 10.921) | 46,50% a 48,38% | rebaixado: errou mais que a moeda |
| **Reversão** | **55,64% (1.420 de 2.552)** | **53,70% a 57,57%** | **provou valor** (peso 0,037) |
| Volume | 48,27% (8.025 de 16.625) | 47,51% a 49,04% | rebaixado: errou mais que a moeda |
| Sentimento | 49,95% (2.569 de 5.143) | 48,58% a 51,32% | rebaixado: igual à moeda |
| Tendência da estratégia (Placar clássico) | 47,89% (7.225 de 15.085) | 47,09% a 48,70% | não vota |

Ou seja: **hoje só a Reversão prova valor** em 15 min; os outros três falam, mas não votam. A sala precisa mostrar isso
de um jeito que um leigo entenda em segundos, sem virar promessa.

## 2. Objetivo

No detalhe de uma simulação ao vivo com o analista ligado (spec 007), um cartão **"Sala da equipe"** mostra seis
bonequinhos numa sala isométrica (estilo Habbo, desenhados em SVG na casa):

- **Quatro especialistas ao fundo**, cada um com um **balão** com a opinião REAL daquela vela: o voto (a favor / contra /
  neutro / sem leitura, com ícone + palavra + cor) e um **motivo curto** em palavras ("O RSI (28,6) está abaixo de 30.").
  Embaixo de cada um, a **plaquinha do auditor**: situação, acerto "N de M" e peso (ou "não vota").
- Quem **não provou valor** fala **baixo**: balão tracejado, cor apagada, plaquinha "não vota". Quem provou e votou ganha
  balão com borda de destaque e o ladrilho aceso.
- O **analista** na frente, com a postura (PAUSA / CAUTELA / MODERADA / LIBERADA), o ritmo, o tamanho, a duração e o motivo
  — inclusive "Sem previsão" e a trava que o pausou.
- O **auditor** ao lado, com a prancheta: quem prova valor contra a moeda ao ar (intervalo de Wilson) e quem foi rebaixado.

Quando chega vela nova, a sala "acorda": os especialistas **pensam** (três pontinhos), **falam em sequência**, quem votou
ganha um destaque breve e o **analista decide por último**. Tudo em menos de 2 s, só com propósito, e trocado por mudança
instantânea com `prefers-reduced-motion` ou com o botão "Animação: desligada". As mesmas falas existem numa **lista de
texto** ("Falas desta vela em texto") e num aviso `aria-live` moderado.

Preview navegável: `docs/preview/sala-da-equipe/index.html` (cenas: vela nova, equipe dividida, mercado confuso, pausa por
trava, auditor), com capturas em `docs/preview/sala-da-equipe/capturas/`.

## 3. Requisitos funcionais

- **RF01 — Onde aparece.** Só no detalhe da `live_paper` com `runs.request.analyst` (spec 007 RF01), como cartão próprio
  **acima** do cartão "Analista de risco" da 007 (D1-A), recolhível ("Esconder a sala" / "Mostrar a sala", lembrado no
  `localStorage` junto do tema, sem dado da simulação). Simulação sem analista: o cartão não existe.
- **RF02 — Fonte única dos dados.** Tudo vem de `GET /v1/runs/:runId/analyst` (`current`, `locks`, `goalProgress`) e, para
  rever velas, de `GET /v1/runs/:runId/analyst/decisions` (spec 007 A20). O painel **não calcula** voto, peso, veredito,
  postura nem trava: só posiciona, anima e formata. Chaves de consulta `['runs', runId, 'analyst']` e
  `['runs', runId, 'analyst-decisions']` (o aviso `runs` do stream as refaz; nenhum polling novo).
- **RF03 — Especialistas.** Um bonequinho por item de `specialists` com `key` em `trend | reversion | volume | sentiment`,
  na ordem da A16. Balão: nome, voto (`vote` + `isUnread` → a favor / contra / neutro / sem leitura) e o motivo curto
  (`motive`, RF05). Plaquinha: situação (`verdict` → frase da A7), acerto (`hitRate`, `hits`, `counted` → "55,64% (1.420
  de 2.552)" ou "— (N contadas)" abaixo de 30) e peso (`weight` → "peso 0,03") ou "não vota" quando `weight = '0'`.
- **RF04 — Quem fala baixo.** `verdict ≠ above` → balão "quieto" (tracejado, `--surface-2`, texto `--ink-2`), bonequinho
  com saturação reduzida e plaquinha "não vota". `verdict = above` **e** voto ≠ 0 → "votou": borda `--accent` de 2 px,
  ladrilho aceso e o destaque breve (RF09). `verdict = above` com voto 0 → balão normal, sem destaque.
- **RF05 — Motivo curto (catálogo fechado, D4-A).** Cada especialista diz **qual regra dele** decidiu o voto, em frase do
  servidor. Regra: com voto ±1, a primeira regra do especialista (ordem do catálogo A2) que votou no mesmo sinal; com voto
  0, a frase "neutra" da primeira regra, ou "As regras dele se anulam nesta vela." se houve votos +1 e −1 que somaram 0;
  sem leitura, a frase de sem leitura. As frases de "contra" e "neutro" **são as da spec 008** (`describeRuleCondition`,
  L15) e as de "a favor" e "sem leitura" entram no catálogo (§5). Nunca texto livre, nunca "vai subir".
- **RF06 — Analista.** Bonequinho com o balão: rótulo da postura (`postureLabel`, ícone + palavra + cor, §4 RNF04), a
  frase da postura (`message`), o motivo (`reasonMessage`) e, na sombra, o selo "Modo sombra: só observa" no cabeçalho
  do cartão com a frase da A17 no `title`/glossário. "Sem previsão" aparece quando o motivo é um dos de A12 — o texto já
  vem do servidor. Fora da janela de ritmo, a frase "Fora da janela de entrada…" da A17.
- **RF07 — Auditor.** Bonequinho com prancheta. Em vela nova ele fica calado (balão vazio, não ocupa espaço). Ao tocar
  em "O que o auditor diz" (ou na cena de revisão, RF10), o balão lista cada especialista com a situação da A7 e a
  "Tendência da estratégia" com "não vota"; ao lado, a **prancheta**: barra do intervalo de Wilson de cada item contra a
  linha de 50% ("moeda ao ar"), com o ponto do acerto (números `lower`, `upper`, `hitRate` do servidor; o painel só
  desloca a vírgula do texto em `BigInt`, como a 009).
- **RF08 — Travas e meta.** Painel lateral "Travas" com as cinco linhas da A17 (`lockMessages`), a ativa com cadeado
  fechado + "ativa" + cor `--warn`; e a linha da meta somada (`goalProgress.message`). São as mesmas frases do cartão da
  007 (nada novo).
- **RF09 — Animação com propósito** (D2-A). Só quando chega uma decisão de vela NOVA (o `candleTime` de `current` mudou
  desde a última renderização): (1) o selo da vela "aparece" (escala 0,85→1, `--motion-fast`); (2) os especialistas
  "pensam" (três pontinhos piscando e o corpo subindo 3 px) por ~450 ms; (3) falam um por vez, a cada 150 ms (balão
  entra com opacidade e 6 px de subida, `--motion-medium`); (4) quem votou ganha um anel que expande e some uma vez
  (2 × `--motion-medium`); (5) o analista pensa ~250 ms e fala por último. Sequência total ≤ 1,8 s. Abrir a tela,
  trocar de aba ou rever vela antiga: **sem animação** (estado final direto). Nada pisca em laço depois do fim.
- **RF10 — Rever velas.** Botões "← Vela anterior" e "Próxima vela →" (44 px) percorrem as decisões já carregadas de
  `/analyst/decisions` (24 por página, "Ver decisões anteriores" busca mais); a vela revista mostra o estado final, sem
  animação, com o selo "Revendo a vela das HH:MM" e "Voltar para agora". "Repetir" refaz a animação da vela mostrada.
- **RF11 — Falas em texto e leitor de tela.** O palco é decorativo (`aria-hidden="true"`, sem elemento focável dentro). O
  texto equivalente fica em `<details>` "Falas desta vela em texto" (aberto a partir de 1024 px, fechado abaixo), uma
  `<ol>` com uma linha por personagem: nome, voto, motivo, acerto, situação, peso/"não vota"; analista com postura e
  motivo; auditor quando falou. Um `<p aria-live="polite">` anuncia **uma vez por vela nova**, no fim da sequência:
  "Vela das HH:MM. Reversão: a favor. Analista: MODERADA. As falas estão na lista…" (nunca um anúncio por balão).
- **RF12 — Estados sem decisão.** `current.status = unavailable` (A20: `not_running`, `stalled`, `waiting_for_data`,
  `no_candle`, `warming_up`, `failed`): os seis bonequinhos ficam parados e o analista mostra só a frase "Indisponível" ou
  "Falha" da A17 num balão neutro; especialistas sem balão. Carregando: esqueleto da sala sem bonequinhos falando.
  Erro de rede: o cartão diz "Não deu para carregar a sala agora." com "Tentar de novo" (frase de interface, não fala).
- **RF13 — Legenda.** Abaixo do palco: "a favor = acha que a próxima vela fecha acima", "contra = acha que fecha
  abaixo", "neutro = sem opinião", "balão tracejado = não vota (não provou valor)". Termos ligados ao glossário da 007
  (especialista, auditor, moeda ao ar, intervalo de confiança, sem previsão, trava, modo sombra) pelo `Term`.

## 4. Requisitos não funcionais

- **RNF01 — Honestidade.** Toda fala (balão e lista) é texto do servidor, de catálogo fechado (A17 da 007 + §5 desta
  spec). O painel só junta frases prontas com separadores ("·"). Nenhum "vai subir", "garantido", "recomendamos",
  "compre", "venda", "confiante". O aviso fixo da A17 fica no rodapé do cartão. O contrato do painel varre as frases de
  interface novas atrás das palavras proibidas.
- **RNF02 — Movimento.** Durações SÓ em tokens (`--motion-fast` 160 ms, `--motion-medium` 240 ms, novo); os atrasos da
  sequência são constantes num arquivo (`team-room-timeline.constant.ts`). `prefers-reduced-motion: reduce` ou o botão
  "Animação" desligado → estado final instantâneo, sem pontinhos, sem anel. O contrato de design já reprova
  `animation`/`transition` sem `prefers-reduced-motion` (`test/design-review.contract.ts`).
- **RNF03 — Leve.** CSS Modules + SVG à mão, **nenhuma biblioteca nova** (nem de animação, nem de sprite, nem imagem
  externa). Cores e roupas por classe com tokens (nada de `style=`): os bonequinhos têm `--shirt-*` só decorativos.
  Sequência por `setTimeout` com limpeza no desmonte (um hook `useTeamRoomSequence`), sem `requestAnimationFrame` em laço.
- **RNF04 — Estado = ícone + palavra + cor.** Voto: seta ↗ "a favor" `--buy`, seta ↘ "contra" `--sell`, traço "neutro"
  `--ink-2`, tracejado "sem leitura". Situação: ✓ "provou valor" `--accent`, ↘ "rebaixado: errou mais que a moeda"
  `--warn`, traço "rebaixado: igual à moeda" `--ink-2`, relógio "em observação: menos de 30". Postura: pausa ‖ "PAUSA"
  `--warn`, ¼ "CAUTELA" neutro, ½ "MODERADA" `--accent-soft`, círculo cheio "LIBERADA" `--accent` (nunca verde: verde é
  "compra" no resto do painel).
- **RNF05 — Layout.** Container query no palco: ≥ 640 px de largura útil = sala (4 especialistas ao fundo em grade, analista
  e auditor na frente, piso isométrico em `repeating-linear-gradient`); < 640 px = lista (uma linha por personagem:
  bonequinho de 64 px + balão + plaquinha). 375 px sem rolagem horizontal; 1280 px com o painel lateral de 340 px; dois
  temas; alvos de 44 px; foco visível; contraste ≥ 4,5:1 (texto) e ≥ 3:1 (bordas do balão que votou, ladrilho aceso).
- **RNF06 — Código do painel.** Componente ≤ 40 linhas, arquivo ≤ 200, sem `as`, sem `any`, sem `default export`; testes
  em `test/*.contract.tsx` na lista explícita do script `test`.
- **RNF07 — Desempenho.** O palco re-renderiza só quando `current.candleTime` muda ou a vela revista muda; os SVGs dos
  bonequinhos são componentes puros memorizáveis por papel. Nenhuma consulta nova além das duas da 007.

## 5. Frases novas (catálogo fechado; entram em `analyst-messages.ts` da 007 pela T1.1 desta spec)

Motivo curto do especialista (`motive`). "Contra" e "neutro" reaproveitam o texto de `describeRuleCondition` (spec 008, L15);
o painel põe a primeira letra em maiúscula e o ponto final.

| Regra (A2) | a favor (novo) | contra (spec 008) | neutro (spec 008) |
|---|---|---|---|
| `ema-9-21` | "a média rápida (EMA 9) está acima da lenta (EMA 21)" | "a média rápida (EMA 9) está abaixo da lenta (EMA 21)" | "as médias estão empatadas" |
| `macd-12-26-9` | "o MACD está acima da linha de sinal" | "o MACD ainda está abaixo da linha de sinal" | "o MACD está igual à linha de sinal" |
| `donchian-20` | "o preço fechou acima da máxima das últimas 20 velas" | "o preço fechou abaixo da mínima das últimas 20 velas" | "o preço não fechou acima da máxima das últimas 20 velas" |
| `rsi-14` | "o RSI ({x}) está abaixo de 30" | "o RSI ({x}) está acima de 70" | "o RSI ({x}) está entre 30 e 70" |
| `bollinger-20` | "o preço fechou abaixo da banda inferior" | "o preço fechou acima da banda superior" | "o preço está dentro das bandas" |
| `obv-ema-20` | "o volume (OBV) está acima da média dele" | "o volume (OBV) está abaixo da média dele" | "o volume (OBV) está igual à média dele" |
| `fear-greed-25-75` | "o Fear & Greed ({x}) está em medo (até 25)" | "o Fear & Greed ({x}) está em ganância (a partir de 75)" | "o Fear & Greed ({x}) não está em medo (até 25)" |

Extras: anulação "As regras dele se anulam nesta vela." · sem leitura por aquecimento "ainda juntando histórico do par" ·
sem leitura do sentimento "sem leitura do Fear & Greed há mais de 48 horas". `{x}` = leitura com 1 casa, como a 008.

Frases de interface (não são falas; vivem no painel): "Sala da equipe", "Falas desta vela em texto", "Repetir",
"Animação", "← Vela anterior", "Próxima vela →", "Revendo a vela das HH:MM", "Voltar para agora", "Não deu para carregar a
sala agora.", "Tentar de novo", a legenda da RF13 e "não vota".

## 6. Decisões tomadas por padrão (o usuário pode mudar — ver §10)

| # | Decisão | Por quê | Alternativa |
|---|---|---|---|
| D1 | **Cartão próprio acima do "Analista de risco"**, recolhível | A sala é a porta de entrada visual; a tabela da 007 continua sendo a fonte detalhada | **B:** a sala substitui a tabela da equipe |
| D2 | **Animação só na vela nova**, ≤ 1,8 s, com botão para desligar além do `prefers-reduced-motion` | Movimento com propósito (algo mudou); quem acha cansativo desliga | **B:** sala estática, sem animação nenhuma |
| D3 | **Situação do catálogo** na plaquinha ("rebaixado: errou mais que a moeda", "rebaixado: igual à moeda"; "em observação" só abaixo de 30 contadas) | "Em observação" já tem sentido fechado na 007 (A7); chamar de observação quem já foi medido em milhares de velas seria impreciso | **B:** todos os que não provaram viram "em observação" (frase nova; muda a A7 → `analyst-2`) |
| D4 | **Motivo curto por regra** (§5), com `ruleVotes` gravados na decisão — **muda o contrato da 007** (A16, A17, A20) | É o "motivo" do pedido; sem ele o balão só diz "a favor" | **B:** balão sem motivo (só voto, acerto, situação e peso); nada muda na 007 |
| D5 | **Bonequinhos em SVG próprio** (seis personagens, roupas por papel, acessório: boné, ↺, fones, coração, gravata e óculos, lupa e prancheta) | Leve, sem imagem externa nem licença; funciona nos dois temas | **B:** ícones simples no lugar de personagens |
| D6 | **Acerto da janela do auditor (30 dias, 2.880 velas)**, o mesmo que dá o peso | Coerência: o número mostrado é o que decide o voto | **B:** mostrar 6 meses (mais estável, mas não é o que pesa). O preview usa 183 dias (os números da T0.2) e diz isso na tela |
| D7 | **Rever velas** pelas decisões já carregadas (RF10), sem animação | O "replay" é o jeito natural de entender a sala; não custa consulta nova | **B:** só a vela atual |

## 7. Fora do escopo

- Qualquer mudança na regra `analyst-1` (votos, peso, postura, travas): a sala só mostra.
- Andar pela sala, arrastar bonequinho, chat, som, avatar personalizável.
- A sala no backtest e no walk-forward (o analista só existe na `live_paper`, spec 007).
- Animação no gráfico (D12 da 007) e alerta no Telegram.
- Qualquer ordem real, chave de corretora ou modo `live`. Tudo simulado, dinheiro fictício.

## 8. Critérios de aceite

1. Com a fixture de `/analyst` da 007 em sombra: seis bonequinhos; os quatro balões com voto + motivo do servidor
   (texto literal); a Reversão `above` com voto +1 tem borda de destaque e "peso 0,03"; os outros três têm balão
   tracejado e "não vota"; o analista mostra o rótulo e as duas frases do servidor.
2. Cada `unavailable` (A20) e a falha mostram a frase literal da A17 e nenhum especialista falando.
3. Vela nova pelo aviso do stream: a sequência roda uma vez (contrato com relógio falso: pensa → 4 falas em ordem →
   analista → `aria-live` com a frase de resumo); abrir a tela ou rever vela: sem sequência.
4. `prefers-reduced-motion` (e o botão desligado): estado final no primeiro quadro, nenhum `animation` aplicado.
5. Lista de texto com uma linha por personagem, igual ao palco; palco `aria-hidden` sem elemento focável.
6. 375 px sem rolagem horizontal (modo lista), 1280 px (modo sala), dois temas; contraste e alvos de 44 px provados nos
   contratos existentes (`contrast`, `touch-targets`, `design-review`); uma captura final por tema em `evidence.md`.
7. Varredura das frases novas (§5 e interface) sem palavra proibida (RNF01).
8. Com D4-A: o motivo de cada especialista bate com `ruleVotes` em todos os casos (favor, contra, neutro, anulação, sem
   leitura) nos conjuntos reais da 007; dourado `analyst-1` regravado só no campo novo (decisão igual byte a byte).

## 9. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| A sala parece um jogo e o leigo lê como "a equipe garante" | Decisão com dinheiro real | Aviso fixo da A17 no cartão, "não vota" visível, nenhuma fala fora do catálogo, nada verde na postura |
| Só a Reversão vota: a sala fica "um fala, três enfeitam" | Parece defeito | A nota da cena e a legenda dizem por quê; é a resposta honesta da T0.2 |
| "Equipe dividida" (`split_team`) nunca acontece com um aprovado | O usuário espera ver o caso e não vê | A sala mostra a discordância entre quem não vota e explica; o caso real fica coberto em contrato com fixture de dois aprovados |
| `too_volatile` vence `team_against` na A12: com mercado agitado e a Reversão **contra**, o analista dá CAUTELA ¼, não PAUSA | Parece contraditório na sala | Registrado como pergunta para a 007 (§10, item 8); a sala só mostra o que a regra decidiu |
| D4-A mexe no contrato da 007 enquanto outro executor trabalha nela | Conflito de arquivos | A T1.1 só começa com a 007 Fase 3 fechada e **para e pergunta** se a 007 ainda estiver em execução |
| Animação cansa ou distrai | Usuário desliga a tela | Só na vela nova (a cada 15 min), ≤ 1,8 s, botão de desligar, `prefers-reduced-motion` |
| Seis SVGs por renderização pesam no celular | Quadro travado | SVG simples (≈ 25 formas), sem filtro caro (só `saturate` nos quietos), animação só de `opacity`/`transform` |

## 10. Decisões que o usuário precisa tomar (A = recomendado)

1. **Lugar (D1):** A) cartão próprio acima do "Analista de risco", recolhível · B) a sala substitui a tabela. *Sem resposta: A.*
2. **Animação (D2):** A) só na vela nova, ≤ 1,8 s, com botão de desligar · B) sem animação. *Sem resposta: A.*
3. **Plaquinha de quem não provou (D3):** A) a situação do catálogo ("rebaixado: …") · B) "em observação" para todos
   (frase nova, `analyst-2`). *Sem resposta: A.* (O pedido falava em "em observação"; a 007 já usa essa expressão só para
   menos de 30 previsões contadas.)
4. **Motivo curto (D4):** A) frases por regra (§5) com `ruleVotes` na decisão — **muda o contrato da 007, exige
   autorização e a 007 Fase 3 fechada** · B) sem motivo. *Sem resposta: a execução faz a sala sem motivo (B) e para na T1.1.*
5. **Bonequinhos (D5):** A) personagens em SVG · B) ícones. *Sem resposta: A.*
6. **Janela do acerto (D6):** A) 30 dias, a do peso · B) 6 meses. *Sem resposta: A.*
7. **Rever velas (D7):** A) sim, pelas decisões carregadas · B) só a vela atual. *Sem resposta: A.*
8. **Pergunta para a 007 (não muda esta spec):** com mercado agitado (`too_volatile`) e a Reversão contra, a regra dá
   CAUTELA ¼. Prefere que "contra" vença e dê PAUSA? Seria `analyst-2`.

**Dependências.** Spec 007 **Fases 2 e 3** prontas: a decisão gravada (T2.1, migration `analyst_decisions` — autorização
da 007 D3; com D3-B a rota recalcula e a sala funciona igual) e as rotas `GET /v1/runs/:runId/analyst` e
`/analyst/decisions` (T3.1), o Zod e o glossário do painel (T3.2) e o `AnalystCard` (T3.3). Esta spec **não cria
migration, não muda o motor nem o `run-recording`, não adiciona dependência**.


## Fase 2: escritório vivo (2026-10-18)

> Pedido: "eles não andam, não tem escritório, não tem mesas nem computadores". Preview aprovado:
> `docs/preview/escritorio-vivo/` (a especificação visual). Decisões aprovadas pelo usuário em 2026-10-18 ("tudo como
> sugerido"). Vale tudo o que a §4 já exige (honestidade, estado = ícone + palavra + cor, nada de lookahead, sem promessa).

### Decisões

| # | Decisão | Valor |
|---|---|---|
| V1 | Estilo | **Plano** na faixa/varanda acima do gráfico; **isométrico** só no cenário da aba cheia "Escritório" |
| V2 | Primeira versão | Varanda animada (andar de lado, mãos, papéis, balões em turnos) + Escritório com cenário fixo (janela da cidade, quadro de cotações, relógio, plantas, mesas com computadores cujas telas mostram gráficos) e agentes andando |
| V3 | Segunda fase (NÃO nesta) | Lousa com níveis (entrada/alvo/proteção) e plaquinha de % líquido; o código deixa só o ponto de extensão `OFFICE_SPOT.BOARD_EXTENSION` |
| V4 | Balões | **Um fala por vez**; o estado fica fixo no crachá (ícone + palavra + cor), nunca só no balão |
| V5 | Ritmo | Ocioso a cada 2–9 s, reunião ~20 s; botão **Calmo** (ritmo ×2, preferência em `localStorage`, com `try/catch`); `prefers-reduced-motion` = só poses fixas, sem andar nem piscar |
| V6 | Quem aparece | Os 6 agentes de regra (Tiago-Tendência, Renata-Reversão, Vitor-Volume, Sofia-Sentimento, Alice-Analista de Risco, Otávio-Auditor) com nome e cargo SEMPRE visíveis, em ao vivo, backtest e walk-forward; equipes de modelo só as LIGADAS (ligada com problema aparece com o estado em palavra) |
| V7 | Backtest e walk-forward | Os agentes não opinam sobre o passado além do que já é gravado (comportamento do `HistoricalTeam` intacto); o movimento é só de cena |

### Requisitos

- **ER-V1 Varanda animada.** Movimento lateral leve, mãos digitando/apontando, papéis e balões em turnos (um por vez, ordem
  embaralhada com semente). Só `transform` e `opacity`.
- **ER-V2 Cenário fixo isométrico.** Piso, paredes, janela com a cidade, quadro de cotações, relógio (o do `OfficeModel`),
  plantas e mesas com computador; cada tela tem um gráfico próprio por agente. Decorativo (`aria-hidden`); a lista de crachás
  abaixo carrega o detalhe (alvo de 44 px).
- **ER-V3 Agentes andam.** Por corredores, nunca por cima de mesa, até a mesa da Alice, ao quadro de cotações e de volta ao
  assento. Reunião (~20 s) na vela nova: a equipe vai à mesa da Alice e volta.
- **ER-V4 Calmo e movimento reduzido.** O botão "Calmo" dobra os intervalos; com `prefers-reduced-motion: reduce` (ou a
  animação desligada) não há relógio de cena, nem classe de movimento: só poses fixas.
- **ER-V5 375 px.** O cenário reduz (unidades de contêiner); a lista de crachás abaixo carrega o detalhe.

### Contratos (provados antes do código)

1. Nomes e cargos dos 6 agentes visíveis; só equipes ligadas aparecem.
2. Balões: no máximo um em `data-speaking`, com relógio falso; o texto de todos continua no DOM.
3. "Calmo" muda o ritmo (intervalos ×2) e a preferência é lembrada.
4. `prefers-reduced-motion`: nenhum atributo/classe de movimento e nenhum temporizador de cena.
5. Roteiro de movimento (dado puro): nenhuma célula de mesa na rota, volta ao assento, determinístico com a mesma semente.

### Riscos de desempenho

| Risco | Mitigação |
|---|---|
| Muitos temporizadores | **Um relógio por cena** (um único temporizador pendente por vez, `cue-runner`); nenhum timer por agente |
| Reflow | Animação só com `transform`/`opacity`; posição por classes/variáveis CSS (sem `style=`) |
| Aba escondida ou fora da tela | Pausa por `visibilitychange` e `IntersectionObserver` (o mesmo observador do escritório) |
| Cenário pesado no celular | Sem SVG filtrado; HTML + CSS; escala por `cqw`; vista frontal antiga continua como alternativa |

## Fase 3 — Sala de operações (aprovada 2026-10-20)

> O dono aprovou a **direção E** do preview `docs/preview/equipe-ao-vivo/escritorio.html` (rodada 3; análise em
> `docs/preview/equipe-ao-vivo/analise.md`): o gráfico de produção é o telão de um escritório de operações em pixel art
> original, com a equipe trabalhando em volta dele. Vale tudo o que a §4 já exige (honestidade, estado = ícone + palavra +
> cor, nada de lookahead, sem promessa, "Simulação com dinheiro fictício · Tendência, não promessa").

### Decisões

| # | Decisão | Valor |
|---|---|---|
| S-D1 | Onde | Só no detalhe da `live_paper` (`BacktestDetailPage` → `LivePaperBody`). Backtest e walk-forward seguem com a coluna histórica (`HistoricalTeam`) |
| S-D2 | O que sai | A varanda (`TeamBalcony`), as plaquinhas da operação e a seção da sala (frontal e isométrica) **desta página**; código sem outro uso é apagado com os testes dele |
| S-D3 | O telão | É o gráfico de produção (`lightweight-charts` pela porta `ChartSurface`), em moldura de terminal escura nos dois temas, com MA20/MA50, volume e as linhas de nível com etiqueta no eixo. Nada da equipe (boneco, balão, laser) entra sobre o canvas |
| S-D4 | Cabeçalho do telão | Par, vela, preço ao vivo e as variações 1m–24h (`PriceVariation`), que saem do cartão "Acompanhamento" (sem duplicar) |
| S-D5 | Números | Só do servidor: `live-status` (placar, decisões e votos), `trade-plan` (compra, alvo, proteção, resultado previsto no alvo e na proteção, comprado, níveis por equipe ◆, motivo tipado quando não há números), opiniões das equipes e previsões. O painel só formata texto decimal |
| S-D6 | Movimento | Roteiro puro com semente (passo de ladrilho de 32, café, telão, visita, alongar) e a **reunião** na troca da decisão (todos vão à frente do telão, a faixa "A equipe decidiu" aparece e cada um volta). "Calmo" (mesma preferência da Fase 2) e `prefers-reduced-motion` congelam a cena onde está; com movimento reduzido nenhuma classe/atributo de movimento é desenhado |
| S-D7 | Quem aparece | Os seis agentes de regra e só as equipes ◆ LIGADAS; a carteira da equipe aparece na mesa dela quando a execução é dela |
| S-D8 | 375 px | Telão em cima, quadros (preços, próxima vela, mapa de calor), a faixa compacta das mesas e a lista de opiniões; o piso com os bonecos não aparece; sem rolagem horizontal |

### Requisitos

- **SR1 Telão-terminal.** Moldura escura (tokens `--terminal-*`, iguais nos dois temas), cabeçalho com par, vela, preço e
  variações, legenda MA20/MA50; as médias são desenho (calculadas dos números de desenho das velas), nunca dinheiro.
- **SR2 Níveis.** Com o `trade-plan` em `awaiting_entry`, as linhas de compra simulada, alvo e proteção com o preço na etiqueta do
  eixo; comprado, entrada, alvo e proteção; sem plano, o gatilho da regra de preço (comportamento anterior).
- **SR3 Parede de telas.** Letreiro dos pares habilitados (preço e variação de 24 h dos dados de preço existentes), relógios
  (Nova York, Londres, Tóquio, São Paulo), Fear & Greed (consulta de sentimento existente, com o crédito), mapa de calor dos
  pares habilitados, quadro "Próxima vela" (hora no fuso do usuário, placar e limiares do `live-status`) e quadro de preços
  (do `trade-plan`).
- **SR4 Mesas e opiniões.** Mesa com monitores por agente; plaquinha com nome, intenção (ícone + palavra + cor) e o resumo; o balão
  de quem vai ao telão mostra compra, alvo, lucro previsto (já sem custo) e proteção quando o servidor os dá; equipe ◆ com a
  confiança; quem está fora do placar fica esmaecido com "fora do placar".
- **SR5 Decisão.** Barra fixa com a decisão da Alice (números do `trade-plan`) e a faixa na reunião; UM `aria-live` anuncia só a
  troca da decisão.
- **SR6 Texto.** Lista "O que cada um acha" com o mesmo conteúdo dos balões (alternativa para leitor de tela e celular).
- **SR7 Acessibilidade.** Cena decorativa `aria-hidden`; ordem de foco: Calmo → telão → lista; alvos de 44 px; contraste dos pares
  novos testado nos dois temas.

### Contratos (provados antes do código)

1. O Zod do `trade-plan` aceita as três formas do servidor e recusa campo fora do contrato.
2. Opiniões: números só do `trade-plan`/`live-status` (texto do servidor formatado); equipe desligada não aparece.
3. Avatares e mobília: pixel art determinística (mesma entrada = mesmo desenho), contorno automático.
4. Roteiro: mesma semente = mesma sequência; passo de no máximo um ladrilho; ninguém entra na área do telão; a reunião junta todos
   e devolve cada um ao assento; Calmo e movimento reduzido = nenhum temporizador.
5. Página: sem varanda nem aba isométrica; variações só no telão; `aria-live` único; 375 px sem piso.
