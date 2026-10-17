# Plano — Spec 015

## Fatos conferidos em 2026-10-17 (não repetir a busca)

**Código da casa**

- **Nenhum código de LLM no repo.** Não há `anthropic`, `gemini`, `genai` nem `openai` em `apps/` e `packages/`. Nenhuma
  dependência nova é necessária: `fetch` + Zod.
- **Migrations**: em `packages/database/drizzle/` (`NNNN_nome.sql` + `.rollback.sql`); os esquemas ficam em
  `packages/database/src/schema/`. A última é `0026_candles_display_timeframes`, então a próxima livre é **`0027`**
  (conferir na hora da T2.1).
- **Env por app**:
  - arquivos: `apps/worker-ativada/src/environment.ts` e `apps/api-ativada/src/environment.ts`; os auxiliares ficam em
    `packages/environment/src/` (`checkProductionRules`, `common-schemas.ts`);
  - padrão de segredo opcional: `TELEGRAM_BOT_TOKEN: nonEmptyTextSchema.max(...).optional()` em
    `PRODUCTION_PROFILE.secretVariables`;
  - recurso desligado sem a chave: `apps/worker-ativada/src/alerts/create-alert-wiring.ts:35`.
- **Cliente HTTP com segredo** (modelo a copiar), `apps/worker-ativada/src/alerts/telegram-client.ts:77`:
  - `fetch` com `redirect: 'error'` e `AbortSignal.timeout`;
  - `catch {}` que troca o erro (que cita a URL com o token) por um código;
  - classificação 2xx / 429 (`retry_after`) / 5xx / outro, com os códigos em `alerts.constant.ts:28`.
- **Passo ao vivo do analista**: `apps/worker-ativada/src/live/analyst-step.ts:33` (`decideShadowStep`), chamado em
  `live-step.ts:166`. A linha é gravada na mesma transação por `run-batch.repository.ts:101` (`insertAnalystDecision`).
  `RUN_EVENT_KIND` mora em `packages/database/src/run-events/run-event.constant.ts:7`.
- **`analyst_decisions`** (0024):
  - uma linha por `(run_id, candle_time)`, com `specialists jsonb` (votos, contadas, acertos e veredito de cada
    especialista);
  - `CHECK version in ('analyst-1')` e `mode in ('shadow','govern')`;
  - o ranking da varanda é montado no painel a partir de `current.specialists` (`BoardRanking.component.tsx`,
    `ranking-model.ts`).
- **Wilson**: `packages/statistics/src/wilson-interval.ts`, com `judgeAgainstCoinFlip({ hits, counted })`,
  `computeWilsonInterval` e `COIN_FLIP_MINIMUM_COUNTED = 30`.
- **Limite de taxa**: `apps/api-ativada/src/rate-limit/rate-limit-policy.constant.ts` (`RUN_LIVE_STATUS` na linha 97).
- **Sala da equipe**:
  - modelos ◆ em `apps/frontend-ativada/src/runs/team-room/balcony/` (`BALCONY_MODELS` em
    `balcony.constant.ts:91-95`, `BalconyModels.component.tsx`, `RANKING_MODELS` na linha 125, `ranking-model.ts`);
  - as preferências da sala ficam só no `localStorage` (`ativada.team-room`, `ativada.balcony-density`);
  - no servidor, só `GET/PATCH /v1/me` (`profile.routes.ts`) e `users.alert_telegram_enabled`. Não há tabela de
    preferências.

**Provedores** (documentação oficial, 2026-10-17)

- **Gemini**:
  - Pro atual: `gemini-3.1-pro-preview`, sem rótulo estável. O `gemini-3-pro-preview` já foi desligado; o `gemini-2.5-pro`
    está listado, com acesso restrito;
  - endpoint `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` com o cabeçalho
    `x-goog-api-key`;
  - saída estruturada: `generationConfig.responseMimeType = application/json` + `responseSchema`;
  - uso em `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `totalTokenCount`);
  - raciocínio por `thinking_level` (`low | medium | high`); no Pro não desliga;
  - preço do 3.1 Pro: US$ 2 / 12 por 1M (≤ 200k), com o raciocínio cobrado como saída e sem plano gratuito. O plano
    gratuito (de outros modelos) usa os dados; o pago não;
  - SDK oficial `@google/genai`, NÃO usado (RNF03);
  - **Conferido na T0.1 (2026-10-17):** o nível de raciocínio no REST `generateContent` é
    `generationConfig.thinkingConfig.thinkingLevel` (`low | medium | high` no 3.1 Pro; sem `minimal`; não desliga). O
    esquema da opinião usa `responseSchema` com só `type`, `properties`, `required`, `enum`, `minimum`, `maximum`; **sem
    `maxLength`** (não consta na lista aceita), então os 160 caracteres do motivo valem só no Zod da casa. A documentação
    marca `generateContent` como "Legacy" ao lado da API Interactions; o adaptador segue em `generateContent` (RF02).
    Ver `evidence.md` (T0.1).
- **Anthropic**:
  - `POST https://api.anthropic.com/v1/messages`, cabeçalhos `x-api-key` e `anthropic-version: 2023-06-01`;
  - saída por `tools` + `tool_choice: { type: 'tool', name: 'give_opinion' }`;
  - uso em `usage.input_tokens` e `usage.output_tokens`;
  - preços: Haiku 5.5 US$ 0,10 / 0,50 (≤ 100k), Haiku 4.5 US$ 1 / 5, Sonnet 5.5 (`claude-sonnet-5-5`) US$ 2 / 10;
  - **Conferido na T0.1:** id do Haiku 5.5 = `claude-haiku-5-5` (Sonnet 5.5 = `claude-sonnet-5-5`); o id segue no env.

## D1. Onde mora cada peça

| Peça | Lugar | Por quê |
|---|---|---|
| Domínio puro | **Pacote novo** `packages/model-agents/src/` (`@ativada/model-agents`): `model-agent-catalog.constant.ts` (`MODEL_AGENTS`: `nina`/`lucas`/`clara`, provedor, nome, cargo), `model-opinion.schema.ts` (Zod da opinião, RF07), `prompt-input.schema.ts` (`ModelPromptInput`, RF09), `prompt-template.ts` (`PROMPT_VERSION = 'prompt-1'`, `renderPrompt` + `hashPrompt`), `reason-hygiene.ts` (RF08), `model-cost.ts` (custo e reserva, decimal), `budget-policy.ts` (teto dia/mês), `provider-circuit.ts` (máquina de estados, relógio por parâmetro), `opinion-auditor.ts` (contagem do placar → `judgeAgainstCoinFlip`), `model-call-result.types.ts` (resultado da porta), `model-agents-messages.ts` (catálogo fechado das frases da tela) | Puro e testável como o `risk-analyst`; worker e API importam a mesma coisa |
| Porta e adaptadores | `apps/worker-ativada/src/model-agents/`: `model-provider.port.ts`, `anthropic-provider.ts`, `gemini-provider.ts`, `provider-http.ts` (fetch, timeout, `redirect: 'error'`, classificação) | Só o worker tem a chave (D10) |
| Despachante | `apps/worker-ativada/src/model-agents/`: `opinion-dispatcher.ts` (laço, arrendamento, concorrência), `opinion-scheduler.ts` (enfileirar por par na ronda), `create-model-agents-wiring.ts` (liga só com chave), `provider-status.ts` (resumo no batimento) | Mesmo desenho do despachante de alertas (T4.5) |
| Enfileirar no passo | `live-step.ts` ganha UMA chamada a `enqueueModelOpinions` na transação da vela (só `INSERT ... ON CONFLICT DO NOTHING`) | Fila durável; o passo nunca espera o modelo |
| Banco | `packages/database/src/model-agents/`: `model-opinion.repository.ts` (fila, arrendamento, gravação, soma de custo, placar em SQL, comparação), `user-model-agent.repository.ts` (`OwnerScope` no tipo) + esquemas em `src/schema/` | Filtro de dono num lugar; os mutantes entram ali |
| Rotas | `apps/api-ativada/src/model-agents/` (`me-model-agents.route.ts`, `run-model-agents.route.ts`, `model-opinion-request.route.ts`, `*.docs.ts`, `*.validation.ts`) | Padrão das rotas de `runs` |
| Painel | `apps/frontend-ativada/src/runs/team-room/models/` (ficha, estado, botão, comparação) + `src/account/model-agents/` (interruptores) + glossário | A sala já tem o lugar dos ◆ |

## D2. Fluxo de uma opinião `scheduled`

1. **Enfileirar.** A ronda do worker fecha a vela `t` de uma `live_paper` com analista. Na MESMA transação do passo,
   `enqueueModelOpinions({ symbol, timeframe: '15m', candleTime: t })` insere uma linha `pending` por agente que esteja
   (a) ligado por algum dono com simulação `running` com analista naquele par e (b) dentro do ritmo, com
   `(t + d) mod (cadence × 60.000) = 0`. A chave única é parcial, `(agent_key, symbol, timeframe, candle_time,
   prompt_version) WHERE kind = 'scheduled'`, então a segunda simulação do par não duplica.
2. **Montar a entrada.** O despachante, a cada `MODEL_AGENT_POLL_SECONDS` (padrão 2), reivindica até `concurrency`
   linhas `pending` (`FOR UPDATE SKIP LOCKED`, arrendamento `lease_until`). A entrada sai de dado público lido do banco:
   as 48 velas `≤ t` do par, as leituras da linha de `analyst_decisions` de qualquer simulação do par naquela vela (são
   iguais entre simulações, ADR A3) e o Fear & Greed disponível. Ela é validada por `ModelPromptInput` e gravada em
   `input jsonb` com `prompt_hash`.
3. **Pré-checagens, em ordem.** Cada uma, se falhar, grava `skipped` com o código:
   1. `STALE`: mais de 2 velas de idade;
   2. `NO_KEY`;
   3. `CIRCUIT_OPEN`;
   4. `BUDGET_EXHAUSTED`: a reserva sob `pg_advisory_xact_lock(<chave fixa do orçamento>)` passa do teto. A reserva é a
      soma de `cost_usd` (gravado) e `reserved_usd` (em voo) no dia/mês UTC.
4. **Chamar.** `ModelProvider.requestOpinion`, com tempo-limite.
5. **Gravar.** `ok` → valida (RF07) → higiene (RF08) → `decided` com postura, motivo, confiança, tokens, latência e
   custo real (`reserved_usd` zera). Falha → `failed` + código, com o custo pelos tokens se o provedor os devolveu,
   senão 0. O circuito é atualizado.
6. **Avisar.** `pg_notify('model_opinions', { symbol })`. Na Fase 4 o painel consulta por polling só enquanto há
   `pending` à vista; o aviso fica para uma entrega futura pelo stream.

Retomada: arrendamento vencido volta a `pending` (máximo de 2 tentativas, `attempt`); o `STALE` impede chamada atrasada.
Reiniciar o worker nunca duplica, por causa da chave única.

## D3. Prompt `prompt-1` (template fixo, versionado)

- **Instrução** (fixa, pt-BR): papel de analista de mercado de criptomoedas em dados de vela de 15 min. Pergunta única:
  "a próxima vela de 15 min do par fecha acima, abaixo ou sem opinião em relação ao fechamento da última vela?".
  Responder só pela ferramenta/JSON. Motivo em até 160 caracteres, sem prometer nada e sem recomendar compra ou venda.
  "neutral" quando não houver leitura clara.
- **Dados**: um bloco JSON compacto com `symbol`, `timeframe`, `lastCandleCloseTime` (ISO UTC), `candles`
  (`[openTime, open, high, low, close, volume]` × 48, texto decimal), `readings` (`relativeVolume`, `atrRate`,
  `atrPercentile90`, `atrPercentile95`, `momentumShort`, `momentumLong`) e `fearGreed` (`value`, `observedAt`) ou
  `null`.
- **Parâmetros**:
  - temperatura 0 na Anthropic;
  - Gemini com o padrão do modelo e `thinking_level` do env;
  - `maxOutputTokens` = `MODEL_AGENT_MAX_OUTPUT_TOKENS` (padrão 300; no Gemini somado ao orçamento do raciocínio, se
    a API pedir).
- **Mudar o template** exige `prompt-2`. A chave única inclui a versão, e o placar é contado POR versão (a tela mostra a
  versão).

## D4. Custo e teto

- O preço por agente vem do env (`MODEL_AGENT_<NINA|LUCAS|CLARA>_INPUT_USD_PER_MTOK` / `_OUTPUT_USD_PER_MTOK`, texto
  decimal ≤ 8 casas).
- `cost = ceil8((input × pIn + (output + thinking) × pOut) ÷ 1.000.000)`.
- `reserve = ceil8((estimatedInput × pIn + maxOutput' × pOut) ÷ 1.000.000)`, com `estimatedInput = ceil(len(prompt) ÷
  3)` (conservador) e `maxOutput'` = `maxOutputTokens` + o teto do raciocínio (Gemini: `MODEL_AGENT_NINA_MAX_THINKING_TOKENS`,
  padrão 2.000, usado SÓ para reservar).
- Teto: `budget-policy.ts` decide `allow | deny_day | deny_month` pela soma exata. As somas saem de `SUM` com índice em
  `(requested_day)`.

## D5. Circuito por provedor (`provider-circuit.ts`)

- **Estados**: `closed → open(until) → half_open → closed | open`.
- **Transições**:
  - `timeout`/`unavailable` somam falhas seguidas; com 3 seguidas, `open` por 10 min;
  - `rate_limited`: `open` até `retryAfter` (teto de 15 min);
  - `key_rejected`: `open` por 60 min com o estado `key_rejected`;
  - `model_not_found`: `open` por 60 min, estado `model_not_found`;
  - `ok` e `invalid_output` fecham o circuito (o provedor respondeu).
- **Onde vive**: o estado fica em memória do worker (reiniciar = `closed`, aceitável). O relógio entra por parâmetro.
  É publicado no batimento (RF22).

## D6. Migration PROPOSTA `0027_model_agents` (aditiva, com `.rollback.sql`; exige autorização)

```sql
CREATE TABLE model_opinions (
  id uuid PRIMARY KEY,
  agent_key varchar(8) NOT NULL CHECK (agent_key IN ('nina','lucas','clara')),
  provider varchar(16) NOT NULL CHECK (provider IN ('anthropic','google')),
  model_id varchar(80) NOT NULL,
  prompt_version varchar(16) NOT NULL CHECK (prompt_version IN ('prompt-1')),
  kind varchar(12) NOT NULL CHECK (kind IN ('scheduled','on_demand')),
  symbol varchar(20) NOT NULL,
  timeframe varchar(4) NOT NULL CHECK (timeframe IN ('15m')),
  candle_time bigint NOT NULL,
  status varchar(8) NOT NULL CHECK (status IN ('pending','decided','failed','skipped')),
  posture varchar(8) NULL CHECK (posture IN ('up','down','neutral')),
  reason text NULL CHECK (char_length(reason) <= 200),
  reason_hidden boolean NOT NULL DEFAULT false,
  confidence smallint NULL CHECK (confidence BETWEEN 0 AND 100),
  input jsonb NULL,
  prompt_hash char(64) NULL,
  raw_output text NULL CHECK (char_length(raw_output) <= 2048),
  input_tokens integer NULL, output_tokens integer NULL, thinking_tokens integer NULL,
  latency_ms integer NULL,
  cost_usd numeric(14,8) NOT NULL DEFAULT 0,
  reserved_usd numeric(14,8) NOT NULL DEFAULT 0,
  failure_code varchar(48) NULL,
  attempt smallint NOT NULL DEFAULT 0,
  lease_until timestamptz NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  decided_at timestamptz NULL,
  CHECK (status <> 'decided' OR (posture IS NOT NULL AND confidence IS NOT NULL)),
  CHECK (status NOT IN ('failed','skipped') OR failure_code IS NOT NULL)
);
CREATE UNIQUE INDEX model_opinions_scheduled_unique
  ON model_opinions (agent_key, symbol, timeframe, candle_time, prompt_version) WHERE kind = 'scheduled';
CREATE INDEX model_opinions_pending ON model_opinions (requested_at) WHERE status = 'pending';
CREATE INDEX model_opinions_audit ON model_opinions (symbol, agent_key, candle_time DESC);
CREATE INDEX model_opinions_day ON model_opinions (requested_day);

CREATE TABLE user_model_agents (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  agent_key varchar(8) NOT NULL CHECK (agent_key IN ('nina','lucas','clara')),
  enabled boolean NOT NULL DEFAULT false,
  mode varchar(8) NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow')),
  on_demand_day date NULL,
  on_demand_count smallint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agent_key)
);

ALTER TABLE worker_heartbeats ADD COLUMN model_agents jsonb NULL;
```

- **Rollback**: `DROP TABLE user_model_agents; DROP TABLE model_opinions; ALTER TABLE worker_heartbeats DROP COLUMN
  model_agents;`. As opiniões são dado público e recalculáveis só chamando de novo; o rollback avisa que se perdem.
- **Sem ENUM nativo.** `mode` só aceita `shadow`: o governar exige migration nova (Fase 6).
- **`model_opinions` não tem `user_id`**: é pública como `candles`, sem PII e fora do LGPD. `user_model_agents` entra
  no `ownership-registry`, na exportação e na purga, antes de `users`.
- **A forma de `users (id)` e o nome da tabela de batimento** devem ser conferidos na hora; ajustar a FK se o padrão
  da casa for outro.
- **Retenção** (D9): a tarefa `expire-model-opinions` do cron apaga com mais de 365 dias.

## D7. Rotas (contratos de RF20)

- **Política nova `MODEL_AGENTS_READ`** (60/min por usuário) para os três GET.
- **Política nova `MODEL_OPINION_REQUEST`** (5 por 10 min por usuário). Além dela, o contador diário em
  `user_model_agents` (`UPDATE ... SET on_demand_count = CASE WHEN on_demand_day = hoje THEN on_demand_count + 1 ELSE 1
  END ... WHERE ... AND (on_demand_day <> hoje OR on_demand_count < limite) RETURNING`): nenhuma linha devolvida = `429`.
- **Placar em SQL**: UMA consulta com `LEAD`/junção em `candles` por `(symbol, '15m', candle_time + 900000)`, agrupada
  por agente, devolvendo `hits`, `misses`, `ties` e `counted`. O veredito sai de `judgeAgainstCoinFlip` em TypeScript.
  Mesmo padrão da `projection-1` (spec 009).
- **Comparação**: UMA consulta com as 24 linhas de `analyst_decisions` da simulação (cursor por `candle_time`) e outra
  com as opiniões `scheduled` daquelas velas.
- **No máximo 4 consultas por pedido** (execução, preferências, placar e comparação), com `Promise.all` só depois da
  execução.
- **Erros novos** em `RUN_ERROR_CODE`/um módulo próprio: `MODEL_AGENT_DISABLED`, `MODEL_AGENT_UNAVAILABLE`,
  `MODEL_AGENT_GOVERN_LOCKED`, `MODEL_AGENT_NOT_FOUND` (chave fora do catálogo dá `404`).

## D8. Env (worker, salvo onde indicado)

| Variável | Regra |
|---|---|
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | opcionais, `secretVariables`; ausente = provedor desligado |
| `ANTHROPIC_BASE_URL` (padrão `https://api.anthropic.com`), `GEMINI_BASE_URL` (padrão `https://generativelanguage.googleapis.com`) | `https` em produção; o teste aponta para o falso |
| `MODEL_AGENT_LUCAS_MODEL`, `MODEL_AGENT_CLARA_MODEL` (com a chave Anthropic) e `MODEL_AGENT_NINA_MODEL` (com a chave Gemini) | **obrigatórios quando a chave existe, sem padrão**; texto `[a-z0-9.-]{3,80}` |
| `MODEL_AGENT_<AGENTE>_INPUT_USD_PER_MTOK`, `_OUTPUT_USD_PER_MTOK` | obrigatórios com a chave; decimal ≥ 0, ≤ 8 casas |
| `MODEL_AGENT_NINA_THINKING_LEVEL` | `low` (padrão), `medium` ou `high` |
| `MODEL_AGENT_NINA_MAX_THINKING_TOKENS` | 0 a 32.000, padrão 2.000 (só para a reserva) |
| `MODEL_AGENT_DAILY_BUDGET_USD`, `MODEL_AGENT_MONTHLY_BUDGET_USD` | obrigatórios com qualquer chave; decimal > 0; diário ≤ mensal |
| `MODEL_AGENT_TIMEOUT_SECONDS` | 5 a 60, padrão 20 |
| `MODEL_AGENT_CADENCE_MINUTES` | 15 ou 60, padrão 15 |
| `MODEL_AGENT_MAX_OUTPUT_TOKENS` | 100 a 1.000, padrão 300 |
| `MODEL_AGENT_CONCURRENCY` | 1 a 6, padrão 3 |
| `MODEL_AGENT_POLL_SECONDS` | 1 a 30, padrão 2 |
| API: `MODEL_AGENT_ON_DEMAND_PER_USER_PER_DAY` | 0 a 100, padrão 20 (0 desliga o botão) |

Os exemplos vão em `envs/env.dev` comentados (sem chave). A chave real só em `envs/env.dev.local`, que o usuário edita.

## D9. Fase 6: governar (SÓ DESENHO; exige autorização, `analyst-2` e migration)

- Cada ◆ ligado em "Decidir de verdade" vira um **especialista** da equipe com voto `up` = +1, `down` = −1 e `neutral` = 0.
  O peso segue a A7 (limite inferior − 0,5 só com `above`; senão 0). Ou seja: **mesmo ligado, o modelo não pesa enquanto
  não provar valor** em ≥ 30 opiniões.
- **A opinião de `t` entra na decisão do analista de `t`.** O passo da simulação governada **espera** a linha do par
  ficar `decided`/`failed`/`skipped` até `MODEL_AGENT_GOVERN_DEADLINE_SECONDS` (padrão 45). Ele fica adiado na ronda,
  como a espera por dado; não bloqueia outras simulações, e o preenchimento é na abertura de `t + 1` de qualquer jeito.
  Passado o prazo, o voto é "sem leitura" (0).
- **O voto usado é gravado em `analyst_decisions.specialists`.** O replay e a retomada leem a linha gravada e **nunca
  chamam o modelo**. A chave de reprodução ganha os ids das opiniões.
- **Mudanças**: `analyst-2` (dourado novo, harness e mutantes), migration do `CHECK` de `analyst_decisions.version` e de
  `user_model_agents.mode`, e o contrafactual (sem o modelo × com o modelo gravado) antes de liberar.

## D10. Testes e provas

- **Puros** (`packages/model-agents`):
  - esquema da opinião (bordas 0/100, 160/161 caracteres, chave a mais);
  - higiene (cada palavra proibida, controle, corte);
  - template literal (`prompt-1` dourado com hash);
  - privacidade (varredura de UUID, `@`, chaves fora da lista; a entrada `strictObject` recusa `userId`);
  - custo e reserva (contas à mão, para cima a 8 casas);
  - teto (bordas exatas do dia e do mês);
  - circuito (todas as transições com relógio falso);
  - auditor contra um oráculo `bigint` sem importar `src` (bordas 29/30, empate, lacuna, `neutral`, `on_demand`).
- **Adaptadores** contra provedores falsos (`test-support/fake-anthropic.ts`, `fake-gemini.ts`, com a forma real da
  documentação): 200 válido, JSON inválido, recusa, 429 com `Retry-After`, 5xx, 401, 404, tempo-limite, redirecionamento
  (deve falhar). Mais a sentinela `sk-test-SENTINEL` varrida em logs, erros e linhas.
- **Worker**:
  - enfileirar é idempotente (duas simulações no par = uma linha por agente);
  - o passo não espera, com p95 medido;
  - **a sombra não muda nada**: `fills`/`signals`/`analyst_decisions` byte a byte com e sem agentes;
  - despachante com arrendamento, retomada, `STALE` e teto sob concorrência (duas instâncias, nenhuma passa do teto).
- **Banco**: `make database-test` (fila, unicidade, somas), `make lgpd-test` (`user_model_agents`) e um alvo novo
  `make model-agents-test` (Postgres descartável, worker real em subprocesso, provedores falsos, API real).
- **API**: contratos de rota com `loadApiApp()`, negativos entre usuários, `400` sem eco, `api-openapi` e mutantes do
  filtro de dono (`make api-runs-mutants` +N).
- **Painel**: ficha, estados, botão, comparação, preferências, contraste do `--model`, 44 px, 375 px, glossário e
  E2E (`make panel-e2e`, Edge) com o servidor de controle gravando uma opinião e a tela mostrando sem recarregar.
- **Teste real manual** (Fase 5, com a chave do usuário): uma opinião `on_demand` por provedor. Tokens, custo e latência
  vão para `evidence.md`; nada da chave.

## D11. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Custo foge (Gemini Pro com raciocínio) | Fatura | Teto dia/mês com reserva antes de chamar, `low`, ritmo de 60 min, corte automático na tela |
| Modelo preview desligado pelo Google | Nina para | Id no env; `model_not_found` com frase própria; trocar o id sem deploy de código |
| Leigo lê o motivo do modelo como conselho | Decide com dinheiro real | Higiene (RF08), rodapé "pode errar", aviso fixo, sombra, placar visível |
| Vazamento de chave | Conta do provedor comprometida | Só no worker, `redirect: 'error'`, código sem texto, sentinela nos testes, `secretVariables` |
| Vazamento de dado do usuário ao provedor | LGPD | Entrada `strictObject` só com dado público; opinião por par, sem contexto de usuário; contrato de varredura |
| Saída variável do LLM quebra o determinismo | Replay diverge | Sombra não toca o motor; o governar usa a linha gravada (D9) |
| Provedor lento ou fora | Passo atrasado | Fila durável fora do passo, tempo-limite, circuito, `STALE` |
| Injeção de prompt | Saída manipulada | A entrada é só número de fonte pública, sem texto de fora; a saída passa por Zod e higiene |
