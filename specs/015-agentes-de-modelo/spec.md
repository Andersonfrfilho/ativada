# Spec 015 — Agentes de modelo (Nina, Lucas e Clara opinam de verdade, em modo sombra)

## 1. Problema

A spec 011 desenhou três **agentes de modelo** na varanda e no escritório (Nina, Lucas e Clara, com a marca ◆, a cor
`--model` e o selo "em breve"; `specs/011-sala-da-equipe/escritorio.md` §3, E-RF04). Hoje eles não existem:
`apps/frontend-ativada/src/runs/team-room/balcony/balcony.constant.ts` (`BALCONY_MODELS`) os desenha apagados e sem voto.

Em 2026-10-17 o usuário pediu para **pôr esses agentes para funcionar com modelos de linguagem (LLMs)**, incluindo o
**Gemini Pro (Google)**, e **testar na tela**: ver o que cada modelo diz na vela, quanto custa e se acerta mais que a
moeda ao ar. Ele quer comparar os modelos com os agentes de regra da spec 007.

O que a casa já sabe e esta spec não pode esconder (spec 011 §1; ADR 0002 §"Analista de risco (spec 007)"):

- Em 15 min, só a Reversão provou valor (55,64%, Wilson 53,70% a 57,57%). Tendência, Volume e Sentimento não passaram
  da moeda ao ar. **Não há motivo para supor que um LLM acerte mais.** Por isso o modelo começa medido e sem poder.
- Um LLM **não é determinístico** e custa dinheiro por chamada. O motor da casa é determinístico, e o replay tem de dar
  o mesmo resultado byte a byte. Por isso a opinião do modelo é tratada como **entrada gravada**, igual à decisão do
  analista (ADR 0002 A21 §4).

## 2. Objetivo

Na sala da equipe de uma simulação ao vivo com o analista ligado (spec 007/011), os agentes ◆ ligados pelo usuário
**opinam de verdade** a cada vela de 15 min. Cada opinião traz postura, motivo curto e confiança. Ela é gravada com
modelo, versão do prompt, latência, tokens e custo, e entra no placar de acertos com a mesma régua de Wilson dos outros
agentes. Nesta spec a opinião **nunca governa a simulação**: é modo sombra.

Exemplo da ficha (números ilustrativos; a T0.2 mede os reais):

> ◆ **Nina** · Analista de modelo · **Gemini Pro** (`<id do env>`) · nuvem do Google
> Última opinião (vela das 14:15): ↗ **a favor**, confiança 62. "Três velas seguidas fecharam acima da EMA de 21 com
> volume crescente." *gerado por modelo: Gemini Pro · pode errar*
> Acertos: ◷ em observação, 12 de 30 (faltam 18) · Custo: hoje US$ 0,41 · mês US$ 6,10 · média de 1,9 s por chamada
> Modo: **sombra** (só observa; não decide nada na simulação)

Tudo é **simulado**: dinheiro fictício, nenhuma ordem real, nenhuma chave de corretora, nada é recomendação.

## 3. Requisitos funcionais

### Provedores e agentes

- **RF01 — Porta `ModelProvider`.** Todo modelo é chamado por uma porta única:
  `requestOpinion({ agent, prompt, limits, signal }) → ModelCallResult`. O resultado é sempre um destes: `ok` (opinião
  validada + tokens + latência), `invalid_output`, `refused`, `timeout`, `rate_limited` (com `retryAfterMilliseconds`),
  `unavailable` (5xx/rede), `key_rejected` (401/403), `model_not_found` (404) ou `bad_request` (outro 4xx). Só código,
  **nunca o texto do erro**: o erro do `fetch` cita a URL e os cabeçalhos (padrão do cliente do Telegram, T4.5).
- **RF02 — Adaptadores.** Os adaptadores usam `fetch` direto, **sem SDK** e sem dependência nova:
  - **Anthropic** (Messages API), para os modelos Haiku e Sonnet. A saída estruturada vem de uma ferramenta forçada
    (`tool_choice` com o esquema da opinião), e o Zod da casa valida de novo.
  - **Google Gemini** (`generateContent` com `responseMimeType: application/json` + `responseSchema`), para o modelo
    Pro. `thinking_level` é configurável (padrão `low`; o Pro não deixa desligar o raciocínio, que é cobrado como saída).
- **RF03 — Catálogo fechado de agentes** (D1): **Nina** = Gemini Pro (Google), **Lucas** = Claude Sonnet (Anthropic) e
  **Clara** = Claude Haiku (Anthropic). O **id do modelo** e o **preço por milhão de tokens** de cada agente vêm do env;
  o código não presume nenhum id. O cargo dos três passa a "Analista de modelo" (D2): Notícias e Repórter exigem fonte
  externa ou outro papel, fora desta spec.
- **RF04 — Chave só no servidor.** `ANTHROPIC_API_KEY` e `GEMINI_API_KEY` existem só no env do **worker**, validadas por
  Zod no boot. Ficam em `secretVariables` do perfil de produção, nunca em log, painel, commit, resposta da API nem
  `runs.request`. Chave ausente = provedor desligado, **sem erro**: o agente aparece na tela como "sem chave
  configurada". Chave presente com id ou preço ausente = falha no boot (configuração incompleta, fail-closed).

### Modo sombra, registro e determinismo

- **RF05 — Quando o modelo é chamado.** Uma opinião por **(agente, par, vela de 15 min fechada)**, **compartilhada**
  entre todas as simulações daquele par. A opinião depende só de dado público (RF09), então não há chamada por usuário e
  o custo cresce com o número de pares, não com o de usuários. O agente só é chamado para um par se existir pelo menos
  uma `live_paper` `running` com analista naquele par cujo dono ligou o agente (RF15). O ritmo vem de
  `MODEL_AGENT_CADENCE_MINUTES` (15, ou 60 para economizar).
- **RF06 — Fila durável, fora do passo.** O passo ao vivo **só enfileira**: insere a linha `pending` com
  `ON CONFLICT DO NOTHING`, na mesma transação da vela, como o alerta do Telegram. Um despachante do worker reivindica a
  linha (arrendamento, `FOR UPDATE SKIP LOCKED`), chama o provedor e grava o resultado. **O passo ao vivo nunca espera o
  modelo**, e falha do provedor nunca chega ao passo, ao motor nem a outra simulação.
- **RF07 — Saída validada.** A opinião é um `z.strictObject`:
  - `posture`: `up | down | neutral` (a favor / contra / neutro: "a próxima vela de 15 min fecha acima, abaixo ou sem
    opinião");
  - `reason`: texto de 1 a 160 caracteres, uma linha;
  - `confidence`: inteiro de 0 a 100.

  Fora disso a linha vira `failed`/`INVALID_OUTPUT`, sem nova chamada. O motivo passa pela **higiene de texto** (RF08).
- **RF08 — Higiene do motivo.** Antes de gravar, o motivo é limpo:
  - remove caracteres de controle e quebras de linha e corta em 160 caracteres;
  - se tiver uma palavra proibida da casa ("vai subir", "garantido", "recomendamos", "compre", "venda", "confiante",
    "certeza"), troca o texto pela frase fixa "O modelo deu um motivo fora das regras de linguagem da casa; o texto foi
    ocultado." e marca `reasonHidden`.

  O painel mostra o motivo só como texto, nunca como HTML, sempre com o rodapé "gerado por modelo: <nome> · pode errar".
  É a **única fala que não vem do catálogo fechado** do servidor, e a tela diz isso.
- **RF09 — Privacidade.** O prompt é montado só de um `ModelPromptInput` fechado (`z.strictObject`):
  - par, vela e as últimas 48 velas de 15 min (OHLCV);
  - as leituras públicas do analista naquela vela (volume relativo, ATR %, momentum 4/16, percentis);
  - o Fear & Greed disponível.

  **Não entram** id de usuário, de simulação ou de meta, saldo, posição, meta, preferências, nome, e-mail, nem nada da
  conta. Também não entram os votos dos outros agentes (a opinião é independente, para a comparação valer). Chave de
  corretora nunca chega perto. Um contrato varre o prompt pronto atrás de UUID, `@`, números de saldo e chaves fora da
  lista.
- **RF10 — Registro completo.** Cada linha de `model_opinions` guarda:
  - agente, provedor, id do modelo, versão do prompt (`prompt-1`) e o hash do prompt;
  - a entrada (`input jsonb`, da qual o prompt é reconstruível pelo template da versão);
  - a saída validada e a resposta bruta cortada em 2 KB;
  - tokens de entrada, de saída e de raciocínio, latência, custo estimado em USD (8 casas), status e código de falha.
- **RF11 — Determinismo preservado.** Na sombra a opinião não entra em `advanceCandle`, `analyst_decisions`, no motor
  nem na regra `analyst-1`: a comparação byte a byte de `fills`, `signals` e `analyst_decisions` com e sem os agentes ◆
  é prova obrigatória. Quando um dia governar (Fase 6, só desenho), a opinião entra como **entrada gravada**: o replay lê
  a linha gravada e **nunca chama o modelo de novo**.
- **RF12 — Tempo-limite e circuito.**
  - **Tempo-limite**: cada chamada tem `MODEL_AGENT_TIMEOUT_SECONDS` (padrão 20).
  - **Circuito por provedor**: 3 falhas seguidas de `timeout`/`unavailable` abrem o circuito por 10 min; depois uma única
    chamada de prova decide se fecha.
  - **429**: respeita o `Retry-After` (teto de 15 min).
  - **Chave recusada** (`key_rejected`): circuito aberto por 1 h, e a tela diz "chave recusada pelo provedor".
  - **Modelo inexistente** (`model_not_found`): "modelo indisponível no provedor; confira o id no env".
  - **Vela que envelhece**: com circuito aberto, sem chave ou sem orçamento, a linha vira `skipped` com o motivo. Uma
    linha `scheduled` com mais de 2 velas de idade vira `skipped`/`STALE` e nunca é chamada atrasada.

### Placar de acertos

- **RF13 — Auditor igual ao dos outros agentes.** Por (agente, par), contam as opiniões `scheduled` `decided` dos
  últimos 30 dias com postura ≠ `neutral` cuja vela seguinte já fechou:
  - **acerto**: o fechamento de `t + 15 min` andou para o lado da postura;
  - **erro**: andou para o outro lado;
  - **não conta**: empate, lacuna, `failed` e `skipped`.

  O veredito usa `judgeAgainstCoinFlip` de `@ativada/statistics`, o ÚNICO lugar do Wilson (abaixo de 30 contadas fica
  `too_few`; os vereditos são `above`, `below` e `even`). A confiança declarada **não entra** no veredito; aparece à
  parte como "confiança média quando acertou × quando errou". Opinião `on_demand` (RF18) nunca conta.
- **RF14 — Peso.** Na sombra o peso é sempre "não vota", mesmo com `above`. O peso pela regra A7 (limite inferior − 0,5)
  só existe no governar (Fase 6).

### Preferências, custo e tela

- **RF15 — Interruptor por agente.** Em **Conta → Preferências**, cada agente ◆ tem "Ligado / Desligado". O padrão é
  **desligado**: custo é opt-in. Um segundo controle, "Modo", mostra **Sombra** (fixo) e "Decidir de verdade"
  desabilitado com a frase "Disponível depois da sua autorização e de 30 opiniões medidas". O estado fica no servidor
  (`user_model_agents`, porque o worker precisa saber) e vale para as simulações daquele dono.
- **RF16 — Custo e teto.**
  - **Tetos**: `MODEL_AGENT_DAILY_BUDGET_USD` e `MODEL_AGENT_MONTHLY_BUDGET_USD` (obrigatórios quando há alguma chave),
    globais da instalação, porque a conta do provedor é uma só.
  - **Antes de chamar**, o despachante reserva o custo máximo da chamada (entrada estimada + `maxOutputTokens` ao preço
    do env) sob trava consultiva.
  - **Corte**: se a reserva passa do teto do dia (UTC) ou do mês, a linha vira `skipped`/`BUDGET_EXHAUSTED` e os agentes
    ficam "parados pelo teto de custo" até virar o dia ou o mês.
  - **Depois da chamada**, grava o custo pelos tokens que o provedor devolveu.
  - **Na tela**: custo de hoje e do mês por agente e no total, contra o teto, com a frase "Estimativa pelos tokens e pelo
    preço configurado; a fatura do provedor é a palavra final."
- **RF17 — Na varanda e no escritório.** Os ◆ deixam de ser "em breve" quando o agente está ligado e o provedor tem chave.
  A marca da 011 continua: moldura tracejada, cantos assimétricos, chip no losango, a palavra "MODELO", `--model` e a
  legenda "● Regra ◆ Modelo". O crachá mostra o selo do estado, sempre com ícone + palavra:
  - ↗ "a favor", ↘ "contra", — "neutro" (a opinião da vela);
  - ◷ "pensando" (`pending`);
  - ⚠ "sem chave configurada", ⏸ "parado pelo teto de custo", ⚡ "provedor fora (tentando de novo às HH:MM)", "chave
    recusada" e "modelo indisponível";
  - "desligado".

  O balão traz o motivo e o rodapé "gerado por modelo". A **ficha** mostra modelo e id, onde roda ("nuvem da Anthropic"
  / "nuvem do Google"), modo, última opinião (postura, confiança, motivo, latência, custo), acertos "N de M" com o
  veredito, custo de hoje e do mês, taxa de falha em 24 h e o link "Ligar/desligar nas preferências".
- **RF18 — Testar na tela: "Pedir opinião agora".** Na ficha de um agente ligado e com chave, numa `live_paper` com
  analista `running`, o botão pede uma opinião **avulsa** sobre a última vela fechada do par.
  - O pedido grava uma linha `on_demand`. Ela passa pelo mesmo despachante, teto e circuito e fica marcada na tela como
    "pedido avulso · não entra no placar".
  - **Limite**: `MODEL_AGENT_ON_DEMAND_PER_USER_PER_DAY` (padrão 20) mais o limite de taxa da rota (5 por 10 min por
    usuário).
  - Enquanto a linha está `pending`, a tela consulta a cada 2 s (`runPollMilliseconds`), sem stream novo.
  - Com tudo indisponível (sem chave, teto, circuito), o botão fica desabilitado e mostra a frase do motivo.
- **RF19 — Comparação lado a lado.** O cartão **"Modelos × regras"** (dentro da sala, recolhível) é uma tabela das
  últimas 24 velas, uma linha por vela:
  - os votos dos 4 especialistas de regra (de `analyst_decisions`);
  - a postura de cada ◆ (das linhas `scheduled`);
  - o que a vela seguinte fez (↗ / ↘ / = / "ainda aberta"), com ✓ ou ✗ em cada voto com lado.

  No rodapé fica o placar de 30 dias de todos, regras e modelos, na mesma régua: acerto, Wilson e veredito. Há também a
  frase fixa "Comparação de acerto do lado da próxima vela; não mede lucro e não é recomendação."
- **RF20 — API** (todas `access: USER`, `documentation`, Zod de entrada e saída, `400` com todos os erros e sem eco, o
  MESMO `404` para alheio, inexistente e malformado, contrato negativo entre usuários):
  - `GET /v1/me/model-agents` → os três agentes com `enabled`, `mode`, `providerState` (`ready | no_key |
    budget_exhausted | circuit_open | key_rejected | model_not_found`) e custo/teto do dia e do mês. Os estados vêm do
    batimento do worker; ver RF22.
  - `PATCH /v1/me/model-agents/:agentKey` `{ enabled }` → `200`. `mode: govern` dá `409 MODEL_AGENT_GOVERN_LOCKED`.
  - `GET /v1/runs/:runId/model-agents` → para o par da simulação: cada agente com estado, última opinião `scheduled` e
    `on_demand`, placar de 30 dias e custos; mais `comparison` (RF19, 24 velas, `?cursor=` para as anteriores). Fora da
    `live_paper` dá `409 RUN_NOT_LIVE`; sem analista, `409 ANALYST_NOT_ENABLED`.
  - `POST /v1/runs/:runId/model-agents/:agentKey/opinions` → `202 { opinionId }`. Erros: `409
    MODEL_AGENT_DISABLED` (desligado), `409 MODEL_AGENT_UNAVAILABLE` (com `providerState`), `429` (limite) e `409
    RUN_NOT_RUNNING`.
- **RF21 — Glossário.** Termos novos: agente de modelo, modo sombra (já existe; ganha o exemplo do ◆), custo estimado,
  teto de custo, pedido avulso. Uma frase de até 120 caracteres e um exemplo de tela cada.
- **RF22 — Estado do provedor sem expor a chave.** O worker publica no batimento (`worker_heartbeats`) um resumo em
  `jsonb` só com booleanos e códigos, sem nenhum segredo: `{ agentKey: { keyConfigured, modelConfigured, providerState,
  circuitUntil } }`. É assim que a API sabe dizer "sem chave configurada" sem ter a chave.

## 4. Requisitos não funcionais

- **RNF01 — Nunca derruba nada.** Erro de provedor, de validação, de orçamento ou de rede vira linha `failed` ou
  `skipped` com SÓ o código. O passo ao vivo, as outras simulações, a API e o painel seguem. O despachante roda em laço
  próprio com `allSettled` por linha.
- **RNF02 — Sem segredo em lugar nenhum.** A chave não sai em log, erro, `failure_code`, resposta bruta gravada nem
  batimento. Toda chamada usa `redirect: 'error'`; o log de erro leva só `name` + `code` (`logging/own-error.ts`). Um
  contrato injeta a chave falsa `sk-test-SENTINEL` e varre logs, linhas gravadas e respostas atrás dela.
- **RNF03 — Sem dependência nova.** `fetch` + Zod. Os servidores falsos dos provedores para teste ficam em
  `packages/model-agents/test-support/`, no padrão da Binance falsa.
- **RNF04 — Puro onde dá.** O pacote `packages/model-agents` é puro: sem relógio, I/O, aleatoriedade nem `console`, com
  teste de fronteira como o motor. Ele guarda o catálogo, o esquema da opinião, o template `prompt-1`, a higiene, o
  cálculo de custo, a regra do teto, o circuito como máquina de estados (o relógio entra por parâmetro) e a contagem
  do auditor. Os adaptadores e o despachante moram no worker.
- **RNF05 — Desempenho.** Enfileirar acrescenta ≤ 2 ms p95 ao passo ao vivo. O despachante tem no máximo
  `MODEL_AGENT_CONCURRENCY` chamadas em voo (padrão 3). As rotas respondem em ≤ 300 ms p95, com placar e comparação em
  ≤ 3 consultas e sem cache.
- **RNF06 — Dinheiro.** O custo é texto decimal (`decimal.js` / `EngineDecimal`), arredondado para CIMA a 8 casas, e o
  teto compara em decimal exato. No painel é `BigInt` de escala 8, mostrado como "US$ 0,41". Float nunca.
- **RNF07 — Linguagem.** Nenhuma frase de interface diz "vai subir", "garantido", "recomendamos" ou "confiante". O aviso
  fixo da ficha é: "Agente de modelo: um modelo de linguagem lê os mesmos dados públicos de mercado e opina. Pode errar;
  o auditor mede o acerto. Não é recomendação. Tudo simulado."
- **RNF08 — Painel.** As regras da casa: 375 px sem rolagem horizontal, contraste ≥ 4,5:1, alvos de 44 px, foco
  visível, nunca só cor, `prefers-reduced-motion`, ≤ 40 linhas por função e ≤ 200 por arquivo, teste na lista explícita
  do script `test`.
- **RNF09 — LGPD.** `model_opinions` não tem dado pessoal (é público, como `candles`) e fica fora do registro LGPD.
  `user_model_agents` entra no `ownership-registry`, na exportação NDJSON e na purga, apagada antes de `users`. O
  pedido avulso não guarda quem pediu: o limite por usuário é contado por uma linha agregada de
  `user_model_agents.on_demand_day/on_demand_count`.

## 5. Decisões tomadas por padrão (o usuário pode mudar; ver §9)

| # | Decisão | Por quê | Alternativa |
|---|---|---|---|
| D1 | Nina = Gemini Pro, Lucas = Claude Sonnet, Clara = Claude Haiku | Um modelo por agente já desenhado; os três tamanhos dão a comparação custo × acerto | B: os três no mesmo provedor; C: um quarto agente ◆ só para o Gemini |
| D2 | Cargo dos três = "Analista de modelo", com o mesmo prompt (`prompt-1`) para os três | Mesma entrada e mesma pergunta: a comparação mede o modelo, não o papel. Notícias exige fonte externa autorizada (spec 007 RF19) | B: manter "Notícias" e "Repórter" com prompts diferentes (Nina sem notícia de verdade seria enganoso) |
| D3 | Sombra obrigatória; governar só desenhado (Fase 6) | Nenhum agente de 15 min além da Reversão provou valor; LLM não tem histórico na casa | — (pedido do usuário) |
| D4 | Uma opinião por (agente, par, vela), compartilhada entre usuários | Custo por par, não por usuário; dado público não precisa de contexto do usuário | B: por simulação (custo × usuários; nenhum ganho, já que a entrada é a mesma) |
| D5 | Ritmo de 15 min (`MODEL_AGENT_CADENCE_MINUTES=15`) | Mesma vela do analista e da comparação | B: 60 min, ¼ do custo; o placar leva 4× mais tempo para chegar a 30 |
| D6 | Tetos padrão: **US$ 3/dia e US$ 60/mês** | Cabe 1 par com os 3 agentes a 15 min (~US$ 2,36/dia, §8) com folga para pedidos avulsos | Valor que o usuário escolher |
| D7 | Gemini com `thinking_level=low` | O Pro não desliga o raciocínio, que é cobrado como saída; `high` custa ~2,5× | `medium`/`high` |
| D8 | Higiene do motivo com troca por frase fixa (RF08) | O texto livre do modelo é a única fala fora do catálogo; não pode soar como promessa | B: não mostrar o motivo (só postura e confiança) |
| D9 | Retenção de `model_opinions`: 365 dias, apagadas pelo cron | O placar usa 30 dias; um ano permite rever a comparação | 90 dias |
| D10 | Fonte única do estado do provedor = batimento do worker (RF22) | A chave fica só no worker; a API não precisa dela | B: chave também na API (mais superfície de segredo) |

## 6. Fora do escopo

- Qualquer ordem real, chave de corretora ou modo `live`. Tudo simulado.
- O modelo **governar** a simulação (só desenho na Fase 6; exige `analyst-2`, migration do `CHECK` de `version` e
  autorização).
- Notícias, busca na web ("grounding" do Gemini), ferramentas do modelo, memória entre velas e texto livre de fora no
  prompt.
- Modelos locais (Ollama) e outros provedores. A porta (RF01) os permite numa spec futura.
- O modelo no backtest, no walk-forward e no ranking das metas.
- Alerta no Telegram por opinião de modelo.

## 7. Critérios de aceite

1. **Sem chave nenhuma**: o worker sobe, nenhuma chamada sai, e os três ◆ aparecem "⚠ sem chave configurada" na varanda,
   na ficha e nas preferências. Zero erro em log.
2. **Com provedores falsos**: simulação LINK/USDT 15 min com o analista em sombra e os três agentes ligados. A cada vela
   aparece uma opinião por agente com postura, motivo, confiança, latência e custo. `fills`, `signals` e
   `analyst_decisions` são **idênticos byte a byte** aos da mesma simulação sem os agentes.
3. **Falhas**: timeout, 5xx, 429, 401 e JSON inválido viram `failed` ou `skipped` com o código certo, abrem o circuito
   na 3ª falha seguida e nunca atrasam o passo (p95 do passo igual ± 2 ms).
4. **Teto de custo**: reserva acima do teto → `BUDGET_EXHAUSTED`, nenhuma chamada a mais. O custo do dia na tela é
   igual à soma das linhas, para cima a 8 casas.
5. **Privacidade**: o contrato do prompt não acha UUID, `@`, saldo nem chave fora da lista. A sentinela da chave não
   aparece em log, linha nem resposta.
6. **Placar**: o auditor bate com um oráculo independente (`bigint`, sem importar `src`) e o veredito segue o Wilson nas
   bordas (29/30). `on_demand`, `failed`, `skipped` e `neutral` não contam.
7. **"Pedir opinião agora"** devolve `202`. A ficha mostra "◷ pensando" e depois a opinião marcada "pedido avulso".
   Desligado → `409`; acima do limite → `429`; alheio → `404`.
8. **Comparação**: 24 velas com regras e modelos lado a lado e ✓/✗ certos contra a vela seguinte; vela ainda aberta =
   "ainda aberta".
9. **Teste real (manual, com a chave do usuário)**: uma opinião `on_demand` de cada provedor na tela, com tokens e custo
   registrados em `evidence.md`, sem a chave em lugar nenhum.
10. 375 px sem rolagem horizontal nos dois temas, ◆ distinguível sem cor, e uma captura final por tema em `evidence.md`.

## 8. Custo estimado (preços oficiais conferidos em 2026-10-17)

**Hipóteses** (a T0.2 mede os tokens reais com o provedor falso e o teste manual com o real):

- **Tokens por chamada**: ~3.000 de entrada (instrução ~800 + 48 velas ~2.000 + leituras ~200) e ~120 de saída.
- **Gemini Pro**: + ~800 de raciocínio com `low`, cobrado como saída.
- **Chamadas**: 96 por agente por par por dia, ou 2.880 em 30 dias.

| Agente · modelo (exemplo de id) | Preço por 1M tokens (entrada / saída) | Por chamada | Por par por mês |
|---|---|---|---|
| Clara · Claude Haiku 5.5 (id a conferir) | US$ 0,10 / 0,50 | US$ 0,00036 | **US$ 1,04** |
| Clara · Claude Haiku 4.5 (`claude-haiku-4-5`), se preferir | US$ 1 / 5 | US$ 0,0036 | US$ 10,37 |
| Lucas · Claude Sonnet 5.5 (`claude-sonnet-5-5`) | US$ 2 / 10 | US$ 0,0072 | **US$ 20,74** |
| Nina · Gemini 3.1 Pro (`gemini-3.1-pro-preview`), `low` | US$ 2 / 12 (≤ 200k) | US$ 0,0170 | **US$ 49,08** |
| Nina · o mesmo com `high` (~3.000 de raciocínio) | US$ 2 / 12 | US$ 0,0434 | US$ 125,11 |
| **Os três (Haiku 5.5 + Sonnet 5.5 + Gemini low)** | | | **≈ US$ 71 por par** |

| Cenário (15 min, opiniões compartilhadas por par) | Pares distintos | Por mês |
|---|---|---|
| 1 usuário, 1 par | 1 | ≈ US$ 71 |
| 2–3 usuários no mesmo par | 1 | ≈ US$ 71 (o mesmo: a opinião é por par) |
| 3 usuários, um par cada | 3 | ≈ US$ 213 |
| 3 usuários, dois pares cada, todos diferentes | 6 | ≈ US$ 425 |
| Qualquer cenário com ritmo de 60 min (D5-B) | — | ÷ 4 (≈ US$ 18 por par) |
| Pedidos avulsos (teto de 20/dia/usuário, pior caso Gemini) | — | + até ≈ US$ 10 por usuário |

O Gemini é ~70% do custo. Com o teto padrão (D6: US$ 3/dia, US$ 60/mês) cabe **um par** com os três agentes; mais pares
cortam no teto, e a tela diz "parado pelo teto de custo".

**Fontes**: `ai.google.dev/gemini-api/docs/models` e `/pricing`, `platform.claude.com/docs/en/about-claude/pricing`.

**Avisos**:

- `gemini-3.1-pro-preview` é **preview**, e o Google já desligou o `gemini-3-pro-preview`. Por isso o id fica no env, e
  `model_not_found` aparece na tela.
- O `gemini-2.5-pro` (US$ 1,25 / 10) é a alternativa mais barata, com acesso restrito a quem já o usou.
- O plano gratuito do Gemini usa os dados para melhorar produtos do Google; o pago não. O Pro 3.1 não tem plano
  gratuito, e a recomendação é **chave paga**.

## 9. O que precisa da sua decisão ou autorização (A = recomendado)

1. **Migration `0027_model_agents` (proposta no plan §D6): autorização obrigatória.** Ela cria `model_opinions`,
   `user_model_agents` e a coluna `worker_heartbeats.model_agents jsonb NULL`. Sem ela a execução para na T2.1.
2. **Chaves**: você cria `ANTHROPIC_API_KEY` e `GEMINI_API_KEY` (paga) e as põe no `envs/env.dev.local` do worker, com
   os ids e preços. A I.A. nunca vê nem escreve a chave.
3. **Tetos de custo (D6)**: A) US$ 3/dia e US$ 60/mês · B) outro valor.
4. **Ritmo (D5)**: A) 15 min · B) 60 min (¼ do custo).
5. **Agentes e modelos (D1/D2)**: A) Nina = Gemini Pro, Lucas = Sonnet, Clara = Haiku, mesmo prompt · B) outra combinação.
6. **Raciocínio do Gemini (D7)**: A) `low` · B) `medium`/`high`.
7. **Governar (Fase 6)**: fica para depois de 30 opiniões medidas por agente e da sua autorização. Muda a regra para
   `analyst-2` e exige migration do `CHECK` de `analyst_decisions.version`.
