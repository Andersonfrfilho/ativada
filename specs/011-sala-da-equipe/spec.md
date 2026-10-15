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
