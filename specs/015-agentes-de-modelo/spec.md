# Spec 015 — Equipes de modelo (Gemini, Claude e OpenAI indicam compras e vendas e participam da simulação)

> **Revisão 2 (2026-10-17).** A primeira versão desta spec desenhava três agentes de OPINIÃO isolados em modo sombra.
> O usuário corrigiu: cada I.A. é uma **equipe** que indica compras e vendas **e participa da simulação** com a própria
> carteira fictícia. A pasta mantém o nome `015-agentes-de-modelo` para não quebrar links; o produto se chama
> "equipes de modelo". Tudo o que o usuário pode trocar está na §5 (decisões) e na §9 (autorizações).

## 1. Problema

A spec 011 desenhou os agentes de modelo ◆ na varanda e no escritório (`specs/011-sala-da-equipe/escritorio.md` §3, E-RF04),
hoje apagados e sem voto (`BALCONY_MODELS` em
`apps/frontend-ativada/src/runs/team-room/balcony/balcony.constant.ts`). Em 2026-10-17 o usuário pediu para pôr modelos de
linguagem (LLMs) para funcionar: **Gemini Pro (Google), Claude (Anthropic) e GPT (OpenAI)**, e comparar o desempenho deles
com a estratégia de regras, vendo tudo na tela.

O que a casa já sabe e esta spec não pode esconder (spec 011 §1; ADR 0002 §"Analista de risco (spec 007)"):

- Em 15 min, só a Reversão provou valor (55,64%, Wilson 53,70% a 57,57%). Tendência, Volume e Sentimento não passaram da
  moeda ao ar. **Não há motivo para supor que um LLM acerte mais, nem que lucre.** Por isso a equipe começa medida (placar de
  Wilson) e com carteira **fictícia**.
- Um LLM **não é determinístico** e custa dinheiro por chamada. O motor da casa é determinístico, e o replay tem de dar o
  mesmo resultado byte a byte. Por isso a decisão da equipe é tratada como **entrada gravada** (ADR 0002 A21 §4): grava-se
  uma vez, e o replay lê a gravada sem chamar o modelo.
- O motor hoje **não tem comando de entrada** vindo de fora: `toAnalystCommands` só emite `halt`, `resume` e
  `exit_position`, e o stop e o alvo de uma posição nascem da configuração de risco da estratégia
  (`packages/strategy-engine/src/wallet/`). A §3 (RF14) e o `plan.md` D9 dizem como a decisão do modelo vira ordem sem
  mexer no motor, e o que só uma mudança de motor entregaria (proposta, não aplicada).

## 2. Objetivo

Cada provedor vira **uma equipe ◆ de três papéis internos**, consultada **numa única chamada estruturada por vela de
15 min**:

- **Analista de tendência**: lê as velas e diz para que lado o preço anda;
- **Analista de risco**: lê volatilidade e volume e diz se o risco está baixo, médio ou alto;
- **Gestor**: quem decide. Junta os dois relatórios e emite a **recomendação**: comprar, vender ou esperar, com preço de
  entrada, alvo e proteção (compra) e um motivo curto.

A equipe faz duas coisas, sempre **simuladas** (dinheiro fictício, nenhuma ordem real, nenhuma chave de corretora, nada é
recomendação):

1. **Indica**: a recomendação aparece em plaquinhas e faixas no gráfico, como as do analista, e no placar de acertos com a
   mesma régua de Wilson dos outros agentes.
2. **Participa**: cada equipe ligada tem a **sua própria execução simulada** (`live_paper`, saldo fictício próprio, mesmo
   par e mesma vela), cujas decisões vêm do modelo. Numa tela de **duelo** o usuário compara equipe × equipe × estratégia
   de regras, no mesmo gráfico de patrimônio e no mesmo ranking.

Exemplo da ficha (números ilustrativos; a T0.1 mediu os preços, a T6 mede os tokens reais):

> ◆ **Equipe Nina** · Gemini Pro (`<id do env>`) · nuvem do Google · papéis: tendência, risco e gestor
> Última recomendação (vela das 14:15): **comprar** · entrada 61.700 · alvo 62.400 · proteção 61.350 · confiança 62
> Tendência ↗ "três fechamentos acima da EMA de 21" · Risco médio "volume 1,3× a média" · Gestor "entra na retomada"
> *gerado por modelo: Gemini Pro · pode errar*
> Acertos: ◷ em observação, 12 de 30 (faltam 18) · Carteira da equipe: US$ 1.012,40 (+1,2%) · Custo: hoje US$ 1,60 · mês US$ 21,40

## 3. Requisitos funcionais

### Equipes, provedores e a chamada

- **RF01 — Porta `ModelProvider`.** Todo modelo é chamado por uma porta única:
  `requestTeamReport({ team, prompt, limits, signal }) → ModelCallResult`. O resultado é sempre um destes: `ok` (relatório
  validado + tokens + latência), `invalid_output`, `refused`, `timeout`, `rate_limited` (com `retryAfterMilliseconds`),
  `unavailable` (5xx/rede), `key_rejected` (401/403), `model_not_found` (404) ou `bad_request` (outro 4xx). Só código,
  **nunca o texto do erro**: o erro do `fetch` cita a URL e os cabeçalhos (padrão do cliente do Telegram, T4.5).
- **RF02 — Adaptadores.** `fetch` direto, **sem SDK** e sem dependência nova:
  - **Anthropic** (`POST /v1/messages`): saída estruturada por ferramenta forçada (`tool_choice` com o esquema do relatório);
    a forma forçada não admite raciocínio estendido, então o modelo roda sem ele; o Zod da casa valida de novo.
  - **Google Gemini** (`generateContent`): `responseMimeType: application/json` + `responseSchema`;
    `generationConfig.thinkingConfig.thinkingLevel` configurável (padrão `low`; o Pro não deixa desligar o raciocínio, que
    é cobrado como saída). `responseSchema` não aceita `maxLength`: os limites de texto valem no Zod.
  - **OpenAI** (Responses API, `POST /v1/responses`, cabeçalho `Authorization: Bearer`): `text.format` com
    `{ type: "json_schema", name, strict: true, schema }`, `reasoning.effort` configurável (padrão `low`) e
    `max_output_tokens` (que INCLUI os tokens de raciocínio). O esquema estrito exige todos os campos em `required`,
    `additionalProperties: false` e campo opcional escrito como união com `null`; `maxLength` não é aceito. Resposta com
    item `refusal` = `refused`; `status: incomplete` = `invalid_output`. Uso em `usage.input_tokens`, `usage.output_tokens`
    e `usage.output_tokens_details.reasoning_tokens`.
- **RF03 — Catálogo fechado de equipes** (DT1): **Nina** = Gemini Pro (Google), **Lucas** = Claude Sonnet (Anthropic) e
  **Olívia** = GPT (OpenAI). O **id do modelo** e o **preço por milhão de tokens** de cada equipe vêm do env; o código não
  presume nenhum id. Os papéis internos são os mesmos nas três (DT2): Analista de tendência, Analista de risco e Gestor.
  Na tela o nome é "Equipe Nina ◆" e os três papéis aparecem como o time dela. (Os três ◆ da spec 011 eram Nina, Lucas e
  Clara; a terceira vaga passa a se chamar Olívia por ser a OpenAI.)
- **RF04 — Chave só no servidor.** `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` e `OPENAI_API_KEY` existem só no env do
  **worker**, validadas por Zod no boot. Ficam em `secretVariables` do perfil de produção, nunca em log, painel, commit,
  resposta da API nem `runs.request`. Chave ausente = provedor desligado, **sem erro**: a equipe aparece na tela como "sem
  chave configurada". Chave presente com id ou preço ausente = falha no boot (configuração incompleta, fail-closed).
- **RF05 — Quando o modelo é chamado.** Uma chamada por **(equipe, par, vela de 15 min fechada)**, **compartilhada** entre
  todos os usuários e todas as execuções daquele par: ela depende só de dado público de mercado (RF09), então o custo cresce
  com o número de pares, não com o de usuários. A equipe só é chamada para um par se existir uma `live_paper` `running`
  daquele par que dependa dela (execução da equipe, RF13) ou um usuário que a ligou para indicar no gráfico (RF15). O ritmo
  vem de `MODEL_TEAM_CADENCE_MINUTES` (15, ou 60 para economizar).
- **RF06 — Fila durável, fora do passo.** O passo ao vivo **só enfileira**: insere a linha `pending` com
  `ON CONFLICT DO NOTHING`, na mesma transação da vela, como o alerta do Telegram. Um despachante do worker reivindica a
  linha (arrendamento, `FOR UPDATE SKIP LOCKED`), chama o provedor e grava o resultado. **O passo ao vivo nunca espera o
  modelo** (a execução da equipe espera a linha por prazo curto, RF14, mas isso é a espera por dado dela, não do passo de
  outra simulação), e falha do provedor nunca chega ao motor nem a outra simulação.
- **RF07 — Relatório validado.** A saída é um `z.strictObject` (`TeamReport`):
  - `trend`: `{ stance: up | down | neutral, reason }`;
  - `risk`: `{ level: low | medium | high, reason }`;
  - `decision`: `{ action: buy | sell | hold, entryPrice, targetPrice, stopPrice, confidence, reason }`.

  Textos de 1 a 160 caracteres, uma linha; `confidence` inteiro de 0 a 100. **Regras de coerência** (validadas no Zod da
  casa depois do esquema do provedor): `buy` exige entrada, alvo e proteção em texto decimal com
  `stop < entrada < alvo`; `sell` e `hold` exigem os três preços nulos. A entrada precisa estar a no máximo
  `MODEL_TEAM_ENTRY_TOLERANCE_PERCENT` (padrão 1,5) do fechamento da última vela, e a proteção a no mínimo
  `MODEL_TEAM_MIN_STOP_PERCENT` (padrão 0,2) da entrada. Fora disso a linha vira `failed`/`INVALID_OUTPUT` ou
  `INVALID_LEVELS`, sem nova chamada. **Sem posição de usuário no prompt** (RF09): `buy` quer dizer "boa entrada agora",
  `sell` quer dizer "sair ou ficar fora" (não existe venda a descoberto) e `hold` quer dizer "esperar". Quem traduz isso em
  ordem é a carteira (RF14).
- **RF08 — Higiene dos textos.** Os três motivos passam, antes de gravar, por limpeza: remove caracteres de controle e
  quebras de linha, corta em 160 caracteres e, se tiver uma palavra proibida da casa ("vai subir", "garantido",
  "recomendamos", "compre", "venda", "confiante", "certeza"), troca aquele texto pela frase fixa "O modelo deu um motivo fora
  das regras de linguagem da casa; o texto foi ocultado." e marca `reasonHidden`. O painel mostra o motivo só como texto,
  nunca HTML, sempre com o rodapé "gerado por modelo: <nome> · pode errar". É a **única fala fora do catálogo fechado** do
  servidor, e a tela diz isso.
- **RF09 — Privacidade.** O prompt é montado só de um `TeamPromptInput` fechado (`z.strictObject`): par, vela e as últimas
  48 velas de 15 min (OHLCV); as leituras públicas do analista naquela vela (volume relativo, ATR %, momentum 4/16,
  percentis); o Fear & Greed disponível. **Não entram** id de usuário, de simulação ou de meta, saldo (nem o da carteira
  fictícia da equipe), posição, preferências, nome, e-mail, nem nada da conta, nem os votos das outras equipes ou dos
  especialistas de regra (a opinião é independente, para a comparação valer). Chave de corretora nunca chega perto. Um
  contrato varre o prompt pronto atrás de UUID, `@`, palavras de saldo e chaves fora da lista, **para cada provedor**.
- **RF10 — Registro completo.** Cada linha de `model_team_reports` guarda: equipe, provedor, id do modelo, versão do prompt
  (`team-prompt-1`) e hash; a entrada (`input jsonb`, de onde o prompt é reconstruível); o relatório validado (papéis e
  decisão, com os preços) e a resposta bruta cortada em 2 KB; tokens de entrada, de saída e de raciocínio, latência, custo
  estimado em USD (8 casas), status e código de falha.
- **RF11 — Determinismo preservado.** A decisão da equipe é **entrada gravada**: o passo da execução da equipe lê a linha
  gravada e nunca chama o modelo; o replay lê a mesma linha e dá o mesmo resultado byte a byte. O motor determinístico, o
  `advanceCandle` das execuções de regra, `analyst_decisions` e a regra `analyst-1` não mudam.
- **RF12 — Tempo-limite e circuito.** Tempo-limite por chamada `MODEL_TEAM_TIMEOUT_SECONDS` (padrão 30: a saída é maior que
  a da versão 1). Circuito por provedor: 3 falhas seguidas de `timeout`/`unavailable` abrem por 10 min; depois uma única
  chamada de prova decide se fecha. `429` respeita o `Retry-After` (teto de 15 min). `key_rejected` abre por 1 h e a tela
  diz "chave recusada pelo provedor". `model_not_found` diz "modelo indisponível no provedor; confira o id no env". Com
  circuito aberto, sem chave ou sem orçamento a linha vira `skipped` com o motivo; uma linha `scheduled` com mais de 2
  velas de idade vira `skipped`/`STALE` e nunca é chamada atrasada.

### A equipe participa da simulação

- **RF13 — Execução da equipe e duelo.** Cada equipe ligada pode ter a **sua própria `live_paper`**: dinheiro fictício, saldo
  inicial escolhido pelo usuário (o mesmo em todo o duelo), mesmo par e mesma vela de 15 min. O **duelo** cria de uma vez uma
  execução por equipe escolhida mais, se o usuário quiser, uma execução da estratégia de regras dele, todas com o mesmo
  saldo, as mesmas taxas e a mesma vela de partida, ligadas por um identificador de duelo em `runs.request`. A execução de
  equipe é marcada com ◆ e o nome da equipe na lista e no detalhe; o limite de simulações ao vivo por usuário
  (`maxActiveLivePaperRuns`) vale, então o duelo avisa quantas cabem.
- **RF14 — Como a decisão vira ordem (contrato; mecanismo no `plan.md` D9).** Na vela `t` o passo da execução da equipe:
  1. espera a linha gravada de `(equipe, par, t)` por até `MODEL_TEAM_DECISION_DEADLINE_SECONDS` (padrão 45), como a
     espera por dado, sem bloquear outras simulações; passado o prazo, ou se a linha for `failed`/`skipped`, a decisão é
     **esperar** com o motivo "equipe sem leitura" gravado, e uma decisão que chegar depois **nunca** é aplicada;
  2. traduz a decisão gravada num sinal do motor (compra, venda ou espera) por uma função pura do pacote
     `@ativada/model-agents`;
  3. entrega o sinal à carteira simulada **existente** (`walletStep`), que executa a ordem na **abertura de `t + 1`**: nunca
     na própria vela `t`, sem lookahead;
  4. regras da tradução: compra com a carteira zerada abre posição; venda com posição aberta fecha; compra com posição
     aberta e venda sem posição são ignoradas (e a linha de decisão registra "ignorada: já comprada" ou "ignorada: sem
     posição"); nunca há venda a descoberto.

  Na **opção A** (padrão, DT5) a posição usa o stop e o alvo da configuração de risco da execução (por ATR), e os níveis da
  equipe (entrada, alvo, proteção) são **exibidos e medidos**, sem comandar a ordem. Na **opção B** (proposta, DT5) a
  carteira passa a aceitar os níveis do modelo; ela exige mudança de motor e fica fora desta entrega (Fase 7).
- **RF15 — Interruptor por equipe.** Em **Conta → Preferências**, cada equipe tem "Ligada / Desligada" (padrão
  **desligada**: custo é opt-in). Ligada quer dizer: pode ser chamada para o par das simulações dela e pode entrar num duelo.
  O estado fica no servidor (`user_model_teams`, porque o worker precisa saber).
- **RF16 — Placar de acertos.** Por (equipe, par), contam as recomendações `scheduled` `decided` dos últimos 30 dias com ação
  `buy` ou `sell` cuja vela seguinte já fechou: `buy` acerta se o fechamento de `t + 15 min` subiu em relação ao de `t`;
  `sell` acerta se desceu; empate, lacuna, `hold`, `failed` e `skipped` não contam. O veredito usa `judgeAgainstCoinFlip` de
  `@ativada/statistics`, o ÚNICO lugar do Wilson (abaixo de 30 contadas fica `too_few`). A confiança declarada não entra no
  veredito (aparece à parte, "média quando acertou × quando errou"). Opinião `on_demand` nunca conta. O **resultado da
  carteira** da equipe (retorno, perda máxima) aparece ao lado, rotulado "resultado de uma simulação curta, não prova de
  nada", porque o acerto de lado é a régua estatística e o retorno só informa.

### Custo, tela e API

- **RF17 — Custo e teto.** Tetos `MODEL_TEAM_DAILY_BUDGET_USD` e `MODEL_TEAM_MONTHLY_BUDGET_USD` (obrigatórios com alguma
  chave), globais da instalação. **Antes de chamar**, o despachante reserva o custo máximo da chamada (entrada estimada +
  `maxOutputTokens` + teto do raciocínio, ao preço do env) sob trava consultiva. **Corte automático**: se a reserva passa do
  teto do dia (UTC) ou do mês, a linha vira `skipped`/`BUDGET_EXHAUSTED` e as equipes ficam "parados pelo teto de custo"
  até virar o dia ou o mês; as execuções delas seguem em "equipe sem leitura" (esperar). **Depois da chamada**, grava o
  custo pelos tokens que o provedor devolveu. Na tela: custo de hoje e do mês por equipe e no total, contra o teto, com a
  frase "Estimativa pelos tokens e pelo preço configurado; a fatura do provedor é a palavra final."
- **RF18 — Plaquinhas e faixas no gráfico.** Uma camada nova "Equipes ◆" (ligável e lembrada como as outras, desligada por
  padrão) desenha, por equipe: a **plaquinha** da recomendação na vela de decisão (compra, venda ou espera, com o ◆ e a
  inicial da equipe, ícone + palavra, nunca só cor) e, para a última compra recomendada, a **faixa** com entrada, alvo e
  proteção, valendo em `[t + 15 min, t + 30 min)` e mostrada em degraus nas velas menores (spec 017, sem lookahead visual).
  No balão de valores entra a recomendação da vela. Execução de equipe mostra também as compras e vendas dela, como toda
  `live_paper`.
- **RF19 — Varanda e escritório.** Os ◆ deixam de ser "em breve" quando a equipe está ligada e o provedor tem chave: moldura
  tracejada, cantos assimétricos, chip no losango, a palavra "MODELO", `--model` e a legenda "● Regra ◆ Modelo" (spec 011).
  O crachá mostra o selo do estado, sempre com ícone + palavra: ação da recomendação (comprar, vender, esperar), ◷ "pensando",
  ⚠ "sem chave configurada", ⏸ "parado pelo teto de custo", ⚡ "provedor fora (tentando de novo às HH:MM)", "chave recusada",
  "modelo indisponível" e "desligado". A **ficha** mostra os três papéis (cada um com a sua linha), modelo e id, onde roda
  ("nuvem da Anthropic", "nuvem do Google", "nuvem da OpenAI"), a última recomendação com os preços, acertos "N de M" com o
  veredito, carteira da equipe, custo de hoje e do mês, taxa de falha em 24 h e o link "Ligar/desligar nas preferências".
- **RF20 — Testar na tela: "Pedir opinião agora".** Na ficha de uma equipe ligada, com chave, numa `live_paper` com analista
  `running`, o botão pede um relatório **avulso** sobre a última vela fechada do par. Grava uma linha `on_demand`, passa pelo
  mesmo despachante, teto e circuito, aparece marcada "pedido avulso · não entra no placar" e nunca comanda ordem de
  execução nenhuma. Limite `MODEL_TEAM_ON_DEMAND_PER_USER_PER_DAY` (padrão 20) mais o limite de taxa da rota (5 por 10 min
  por usuário). Enquanto a linha está `pending`, a tela consulta a cada 2 s, sem stream novo. Com tudo indisponível (sem
  chave, teto, circuito), o botão fica desabilitado e mostra a frase do motivo.
- **RF21 — Comparação lado a lado.**
  1. **Tabela "Equipes × regras"** (dentro da sala, recolhível): últimas 24 velas, uma linha por vela, com os votos dos 4
     especialistas de regra (`analyst_decisions`), a ação de cada equipe ◆ e o que a vela seguinte fez (↗ / ↘ / = / "ainda
     aberta"), com ✓ ou ✗ em cada voto com lado.
  2. **Duelo**: gráfico único de **patrimônio** com uma linha por execução do duelo (equipes e regras), cores e legenda com
     ◆/● e nome (nunca só cor), e a **tabela de ranking** com retorno, perda máxima, operações, acerto de lado com Wilson e
     veredito, e **custo de API** por equipe.
  3. Frases fixas: "Comparação de acerto do lado da próxima vela; não mede lucro e não é recomendação." e, no duelo, "Mesmo
     par, mesma vela e mesmo saldo fictício. Período curto não prova nada."
- **RF22 — API** (todas `access: USER`, `documentation`, Zod de entrada e saída, `400` com todos os erros e sem eco, o MESMO
  `404` para alheio, inexistente e malformado, contrato negativo entre usuários). **Propostas; nada é aplicado nesta
  entrega:**
  - `GET /v1/me/model-teams` e `PATCH /v1/me/model-teams/:teamKey` `{ enabled }`;
  - `GET /v1/runs/:runId/model-teams`: por equipe, estado, última recomendação, placar, custos e a `comparison` das 24 velas;
  - `POST /v1/runs/:runId/model-teams/:teamKey/opinions` → `202 { opinionId }`;
  - `POST /v1/model-duels` `{ symbol, startingBalance, teams[], withMyStrategy? }` → cria as execuções do duelo;
  - `GET /v1/model-duels/:duelId`: as execuções, as curvas de patrimônio alinhadas e o ranking.

  A execução de equipe nasce por `runs.request.signalSource = { kind: 'model_team', team }`, validado na criação.
- **RF23 — Glossário e estado do provedor.** Termos novos: equipe de modelo, papel (tendência, risco, gestor), duelo, custo
  estimado, teto de custo, pedido avulso (uma frase de até 120 caracteres e um exemplo de tela cada). O worker publica no
  batimento (`worker_heartbeats`) um resumo em `jsonb` só com booleanos e códigos, sem segredo:
  `{ teamKey: { keyConfigured, modelConfigured, providerState, circuitUntil } }`.

## 4. Requisitos não funcionais

- **RNF01 — Nunca derruba nada.** Erro de provedor, de validação, de orçamento ou de rede vira linha `failed` ou `skipped` com
  SÓ o código. O passo ao vivo das outras simulações, a API e o painel seguem. O despachante roda em laço próprio com
  `allSettled` por linha.
- **RNF02 — Sem segredo em lugar nenhum.** A chave não sai em log, erro, `failure_code`, resposta bruta gravada nem
  batimento. Toda chamada usa `redirect: 'error'`; o log de erro leva só `name` + `code` (`logging/own-error.ts`). Um contrato
  injeta a chave falsa `sk-test-SENTINEL` e varre logs, linhas gravadas e respostas atrás dela, **nos três adaptadores**.
- **RNF03 — Sem dependência nova.** `fetch` + Zod. Os servidores falsos dos três provedores ficam em
  `packages/model-agents/test-support/`, no padrão da Binance falsa.
- **RNF04 — Puro onde dá.** O pacote `packages/model-agents` é puro (sem relógio, I/O, aleatoriedade nem `console`, com teste
  de fronteira como o motor): catálogo, esquema do relatório, regras de coerência dos preços, template `team-prompt-1`,
  higiene, custo, teto, circuito, tradução da decisão em sinal e contagem do auditor. Os adaptadores e o despachante moram
  no worker.
- **RNF05 — Desempenho.** Enfileirar acrescenta ≤ 2 ms p95 ao passo ao vivo. O despachante tem no máximo
  `MODEL_TEAM_CONCURRENCY` chamadas em voo (padrão 3). As rotas respondem em ≤ 300 ms p95, com placar e comparação em ≤ 4
  consultas e sem cache.
- **RNF06 — Dinheiro.** O custo é texto decimal (`EngineDecimal`), arredondado para CIMA a 8 casas, e o teto compara em
  decimal exato. No painel é `BigInt` de escala 8. Float nunca. Os preços do relatório (entrada, alvo, proteção) são texto
  decimal e nunca passam por `Number`.
- **RNF07 — Linguagem.** Nenhuma frase de interface diz "vai subir", "garantido", "recomendamos" ou "confiante". O aviso fixo
  da ficha é: "Equipe de modelo: um modelo de linguagem lê os mesmos dados públicos de mercado, com três papéis, e indica
  compra, venda ou espera. Pode errar; o auditor mede o acerto. Não é recomendação. Tudo simulado."
- **RNF08 — Painel.** As regras da casa: 375 px sem rolagem horizontal, contraste ≥ 4,5:1, alvos de 44 px, foco visível, nunca
  só cor, `prefers-reduced-motion`, ≤ 40 linhas por função e ≤ 200 por arquivo, teste na lista explícita do script `test`.
- **RNF09 — LGPD.** `model_team_reports` não tem dado pessoal (é público, como `candles`). `user_model_teams` entra no
  `ownership-registry`, na exportação NDJSON e na purga, apagada antes de `users`. O pedido avulso não guarda quem pediu: o
  limite por usuário é contado por uma linha agregada de `user_model_teams.on_demand_day/on_demand_count`. As execuções de
  equipe são execuções do usuário e entram no registro LGPD como qualquer `live_paper`.
- **RNF10 — Nenhuma ordem real.** A equipe nunca envia ordem a corretora, não existe chave de corretora e o modo `live`
  continua inexistente. A carteira da equipe é a carteira SIMULADA do motor.

## 5. Decisões tomadas por padrão (o usuário pode trocar; ver §9)

| # | Decisão | Por quê | Alternativa |
|---|---|---|---|
| DT1 | Três equipes: Nina = Gemini Pro, Lucas = Claude Sonnet, Olívia = OpenAI GPT | Um provedor por equipe, como pediu o usuário; os nomes ocupam as três vagas ◆ da spec 011 | Mais de um modelo por provedor (Clara = Haiku volta como quarta equipe); modelos mais baratos (§8) |
| DT2 | Três papéis internos fixos e iguais nas três equipes (tendência, risco, gestor), numa ÚNICA chamada estruturada por vela | Uma chamada custa ¼ de três; o mesmo desenho nas três faz a comparação medir o modelo, não o papel | B: uma chamada por papel (3× o custo e 3× a latência); C: papéis diferentes por provedor |
| DT3 | A recomendação não conhece a posição do usuário; a carteira traduz (RF14) | A chamada fica compartilhada por par e sem dado de usuário; privacidade e custo | B: uma chamada por execução com a posição no prompt (custo × execuções; a equipe vê o saldo fictício) |
| DT4 | Cada equipe tem a sua `live_paper` e o duelo cria o grupo | Pedido do usuário: participar da simulação e comparar no mesmo gráfico | B: a equipe só opina sobre a execução de regras do usuário (versão 1 da spec) |
| DT5 | **Opção A:** a ordem usa o stop e o alvo da configuração de risco; os níveis da equipe são exibidos e medidos. **Opção B (proposta):** a carteira aceita os níveis do modelo | A opção A não mexe no motor determinístico nem no dourado; a B exige mudança de motor (`plan.md` D9) | B, na Fase 7, com autorização |
| DT6 | Ritmo de 15 min (`MODEL_TEAM_CADENCE_MINUTES=15`) | Mesma vela do analista e da comparação | 60 min: ¼ do custo; o placar leva 4× mais tempo para chegar a 30 |
| DT7 | Tetos padrão: **US$ 6/dia e US$ 150/mês** (cabe 1 par com as 3 equipes a 15 min, ~US$ 4,63/dia e US$ 138,82/mês, §8) | Os 3 US$/dia da versão 1 não cobrem mais três equipes com saída maior | Valor que o usuário escolher |
| DT8 | Gemini com `thinkingLevel=low`; OpenAI com `reasoning.effort=low`; Claude sem raciocínio estendido | Raciocínio é cobrado como saída; `high` no Gemini custa ~2,2× | `medium`/`high` |
| DT9 | Higiene dos textos com troca por frase fixa (RF08) | O texto livre do modelo é a única fala fora do catálogo | Esconder os motivos (só ação e preços) |
| DT10 | Retenção de `model_team_reports`: 365 dias | O placar usa 30 dias; um ano permite rever a comparação | 90 dias |
| DT11 | Fonte única do estado do provedor = batimento do worker | A chave fica só no worker | Chave também na API (mais superfície) |
| DT12 | Prazo de espera da decisão pela execução da equipe: 45 s; depois, "esperar" gravado | A vela é de 15 min; 45 s cobre a latência típica sem atrasar a carteira | Prazo maior; ou nunca esperar (a equipe decide uma vela depois) |

## 6. Fora do escopo

- Qualquer ordem real, chave de corretora ou modo `live`. Tudo simulado.
- A equipe **governar a simulação de REGRAS** do usuário (era a Fase 6 da versão 1: `analyst-2`). Agora a equipe tem a
  carteira dela; a estratégia de regras do usuário não recebe comando de modelo.
- Venda a descoberto e alavancagem. Notícias, busca na web ("grounding"), ferramentas do modelo, memória entre velas e texto
  livre de fora no prompt. Modelos locais e outros provedores (a porta RF01 os permite numa spec futura).
- O modelo no backtest, no walk-forward e no ranking das metas. Alerta no Telegram por recomendação de modelo.
- **Níveis do modelo comandando a ordem** (opção B): só proposta, Fase 7.

## 7. Critérios de aceite

1. **Sem chave nenhuma**: o worker sobe, nenhuma chamada sai, e as três equipes ◆ aparecem "⚠ sem chave configurada" na
   varanda, na ficha e nas preferências. Zero erro em log.
2. **Com provedores falsos**: LINK/USDT 15 min, as três equipes ligadas. A cada vela aparece um relatório por equipe, com os
   três papéis, a recomendação, os preços, a latência e o custo. `fills`, `signals` e `analyst_decisions` das execuções de
   REGRA são **idênticos byte a byte** aos da mesma simulação sem as equipes.
3. **Equipe na simulação**: a execução de cada equipe compra na abertura de `t + 1` quando a decisão gravada de `t` é
   `buy` e vende quando é `sell` com posição; ignora compra com posição e venda sem posição; vela sem decisão no prazo
   espera; **replay** da execução (a partir das linhas gravadas, sem provedor ligado) dá `fills` e `equity_points` iguais
   byte a byte.
4. **Falhas**: timeout, 5xx, 429, 401 e JSON inválido viram `failed` ou `skipped` com o código certo, abrem o circuito na 3ª
   falha seguida e nunca atrasam o passo de outras simulações (p95 igual ± 2 ms).
5. **Teto de custo**: reserva acima do teto → `BUDGET_EXHAUSTED`, nenhuma chamada a mais. O custo do dia na tela é igual à
   soma das linhas, para cima a 8 casas.
6. **Privacidade**: o contrato do prompt não acha UUID, `@`, saldo nem chave fora da lista, nos três provedores. A sentinela
   da chave não aparece em log, linha nem resposta, nos três adaptadores.
7. **Placar**: o auditor bate com um oráculo independente (`bigint`, sem importar `src`) e o veredito segue o Wilson nas
   bordas (29/30 contadas). `on_demand`, `failed`, `skipped` e `hold` não contam.
8. **"Pedir opinião agora"** devolve `202`; a ficha mostra "◷ pensando" e depois a recomendação marcada "pedido avulso".
   Desligado → `409`; acima do limite → `429`; alheio → `404`.
9. **Duelo**: duas equipes e a estratégia de regras no mesmo par e saldo; o gráfico de patrimônio mostra as três linhas
   com legenda ◆/● e o ranking bate com `equity_points`.
10. **Gráfico**: a camada "Equipes ◆" mostra plaquinhas e a faixa de entrada, alvo e proteção só a partir de `t + 15 min`.
11. **Teste real (manual, com as chaves do usuário)**: um relatório `on_demand` de cada provedor na tela, com tokens e custo
    registrados em `evidence.md`, sem a chave em lugar nenhum.
12. 375 px sem rolagem horizontal nos dois temas, ◆ distinguível sem cor, uma captura final por tema em `evidence.md`.

## 8. Custo estimado (preços oficiais conferidos em 2026-10-17)

**Hipóteses** (a T6.2 mede os tokens reais com as chaves do usuário):

- **Uma chamada por equipe por vela.** Entrada ~3.200 tokens (instrução com os três papéis ~1.000 + 48 velas ~2.000 + leituras
  ~200). Saída visível ~450 tokens (três textos curtos e três preços; antes eram ~120).
- **Raciocínio cobrado como saída:** Gemini `low` ~800; OpenAI `low` ~500; Claude sem raciocínio (a ferramenta forçada não o
  admite).
- **Chamadas**: 96 por dia a 15 min (2.880 por mês) e 24 por dia a 60 min (720 por mês), por equipe e por par.

| Equipe · modelo (id de exemplo) | US$ por 1M tokens (entrada / saída) | Por chamada | Por par por mês, 15 min | 60 min |
|---|---|---|---|---|
| Nina · Gemini 3.1 Pro (`gemini-3.1-pro-preview`), `low` | 2 / 12 (≤ 200k) | 0,0214 | **61,63** | 15,41 |
| Lucas · Claude Sonnet 5.5 (`claude-sonnet-5-5`) | 2 / 10 | 0,0109 | **31,39** | 7,85 |
| Olívia · OpenAI GPT-6.1 Sol (`gpt-6.1-sol`), `low` | 2 / 10 | 0,0159 | **45,79** | 11,45 |
| **As três equipes** | | **0,0482** | **≈ US$ 138,82** (≈ US$ 4,63/dia) | **≈ US$ 34,70** (≈ US$ 1,16/dia) |

Contas: Gemini = (3.200 × 2 + 1.250 × 12) ÷ 1.000.000; Lucas = (3.200 × 2 + 450 × 10) ÷ 1.000.000; Olívia =
(3.200 × 2 + 950 × 10) ÷ 1.000.000.

| Variação | US$ por mês, 15 min |
|---|---|
| Nina com `thinkingLevel=high` (~3.000 de raciocínio, ~0,0478 por chamada) | 137,66 só dela |
| Opção econômica: Claude Haiku 5.5 (`claude-haiku-5-5`, 0,10 / 0,50) no lugar do Sonnet | 1,57 |
| Opção econômica: OpenAI GPT-6 Luna (`gpt-6-luna`, 0,10 / 0,50) no lugar do Sol | 2,29 |
| Outros modelos OpenAI listados hoje: `gpt-6-astra` (10 / 50), `gpt-5.6-sol` (4 / 20), `gpt-5.4` (2,50 / 15) | a medir pelo preço do env |

| Cenário (15 min, relatórios compartilhados por par) | Pares distintos | Por mês | 60 min |
|---|---|---|---|
| 1 usuário, 1 par | 1 | ≈ US$ 138,82 | ≈ US$ 34,70 |
| 2–3 usuários no mesmo par | 1 | ≈ US$ 138,82 (o mesmo: a chamada é por par) | ≈ US$ 34,70 |
| 3 usuários, um par cada | 3 | ≈ US$ 416,45 | ≈ US$ 104,11 |
| 3 usuários, dois pares cada, todos diferentes | 6 | ≈ US$ 832,90 | ≈ US$ 208,22 |
| Pedidos avulsos (teto de 20/dia/usuário, pior caso Gemini, 0,0214) | — | + até ≈ US$ 12,84 por usuário | igual |

A Nina é ~44% do custo. Com o teto padrão (DT7: US$ 6/dia, US$ 150/mês) cabe **um par** com as três equipes a 15 min; mais pares
cortam no teto e a tela diz "parado pelo teto de custo". Ritmo de 60 min divide tudo por 4.

**Fontes** (todas conferidas em 2026-10-17): `platform.claude.com/docs/en/about-claude/models/overview` (ids e preços do Claude),
`ai.google.dev/gemini-api/docs/pricing` (Gemini 3.1 Pro Preview, US$ 2 / 12, "incluindo tokens de raciocínio"),
`developers.openai.com/api/docs/models` e `/pricing` (GPT-6.1 Sol US$ 2 / 10, GPT-6 Luna US$ 0,10 / 0,50, ≤ 272k de entrada),
`developers.openai.com/api/docs/guides/structured-outputs` e `/guides/reasoning`.

**Avisos**:

- `gemini-3.1-pro-preview` é **preview** e o Google já desligou o `gemini-3-pro-preview`. Por isso o id fica no env, e
  `model_not_found` aparece na tela. O plano gratuito do Gemini usa os dados para melhorar produtos do Google; o pago não: a
  recomendação é **chave paga**.
- A OpenAI lista vários modelos com preços bem diferentes; o id e o preço ficam no env e **nenhum id é presumido no código**.
- A documentação do Gemini marca `generateContent` como "Legacy" ao lado da API Interactions. Se for desligado, o adaptador
  troca de endpoint atrás da mesma porta.

## 9. O que precisa da sua decisão ou autorização (A = recomendado)

Nada abaixo foi aplicado: esta revisão só reescreve a spec. As Fases 0 e 1 (conferência e pacote puro) não exigem nada daqui.

1. **Migration `0027_model_teams` (proposta no `plan.md` D6): autorização obrigatória.** Cria `model_team_reports`,
   `user_model_teams` e a coluna `worker_heartbeats.model_teams jsonb NULL`. Sem ela a execução para na T2.1.
2. **Mudança de API e de worker (`plan.md` D9): autorização obrigatória.** (a) `POST /v1/runs` e `POST /v1/model-duels`
   aceitam `signalSource` de equipe; (b) o worker ganha o passo da execução de equipe (espera da decisão gravada, tradução em
   sinal, `walletStep`); (c) possível mudança ADITIVA no `run-recording` para reaproveitar a gravação das linhas sem
   `advanceCandle`. Nenhuma altera o motor nem as execuções de regra.
3. **Mudança de motor (só opção B, Fase 7): autorização obrigatória e separada.** Novo comando de entrada com níveis,
   `ENGINE_VERSION` novo, dourado regravado, ADR.
4. **Chaves**: você cria `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (paga) e `OPENAI_API_KEY` e as põe no `envs/env.dev.local` do
   worker, com os ids e preços de cada equipe. A I.A. nunca vê nem escreve a chave.
5. **Tetos de custo (DT7)**: A) US$ 6/dia e US$ 150/mês · B) outro valor.
6. **Ritmo (DT6)**: A) 15 min · B) 60 min (¼ do custo).
7. **Equipes e modelos (DT1/DT2)**: A) Nina = Gemini Pro, Lucas = Claude Sonnet, Olívia = GPT, três papéis · B) outra
   combinação (modelos econômicos da §8, quarta equipe, papéis diferentes).
8. **Níveis do modelo (DT5)**: A) exibir e medir, ordem pelo risco da execução · B) o modelo comanda entrada, alvo e proteção
   (exige o item 3).
9. **Raciocínio (DT8)**: A) `low` · B) `medium`/`high`.
