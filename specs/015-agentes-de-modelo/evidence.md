# Evidência — Spec 015

## Fase 0

### T0.1 — Conferência na documentação oficial (2026-10-17)

| Fato | Fonte (URL) | Data | Observação |
|---|---|---|---|
| Id do Haiku 5.5 = `claude-haiku-5-5`; Sonnet 5.5 = `claude-sonnet-5-5` | https://platform.claude.com/docs/en/about-claude/models/overview | 2026-10-17 | Confirmado. O id segue configurável por env (sem padrão no código) |
| Preço Sonnet 5.5 US$ 2 / 10; Haiku 5.5 "a partir de" US$ 0,10 / 0,50 por MTok | mesma página | 2026-10-17 | Bate com o spec §8. O "a partir de" indica faixa por contexto; o preço real fica no env |
| Campo de raciocínio do Gemini no REST `generateContent`: `generationConfig.thinkingConfig.thinkingLevel` (`low`/`medium`/`high`; o 3.1 Pro não aceita `minimal` e não desliga) | resumo de busca sobre https://ai.google.dev/gemini-api/docs/gemini-3 e /docs/generate-content/thinking | 2026-10-17 | **Parcial:** a página `api/generate-content` veio truncada no fetch e não mostrou o `GenerationConfig`; o nome saiu do resumo da busca sobre as páginas oficiais. O adaptador lê o nível do env e o fixture falso copia essa forma; confirmar no teste manual T5.2 (um 400 `bad_request` revela divergência) |
| `responseMimeType` + `responseSchema` em `generationConfig` | https://ai.google.dev/api/generate-content | 2026-10-17 | Confirmado (exemplos camelCase). O esquema aceita `type`, `properties`, `required`, `enum`, `minimum`, `maximum`, `additionalProperties`; `maxLength` NÃO consta (https://ai.google.dev/gemini-api/docs/structured-output) |
| `usageMetadata`: `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `totalTokenCount` | https://ai.google.dev/api/generate-content | 2026-10-17 | Confirmado; `totalTokenCount` = prompt + ferramenta + raciocínio + candidatos |
| `gemini-3.1-pro-preview` aceita `low/medium/high`, padrão `high`, sem desligar | https://ai.google.dev/gemini-api/docs/thinking | 2026-10-17 | Confirmado; o id continua só por env (preview) |
| `generateContent` aparece como "Legacy"; a API nova é `interactions` (`generation_config.thinking_level`, `usage.total_thought_tokens`) | https://ai.google.dev/gemini-api/docs/thinking | 2026-10-17 | Risco registrado: se o Google desligar `generateContent`, o adaptador troca de endpoint atrás da mesma porta (RF01) |
| Próxima migration livre = `0027` | `packages/database/drizzle/` (última `0026_candles_display_timeframes`) | 2026-10-17 | Conferido |
| `worker_heartbeats`: PK `instance_id` varchar, `started_at`, `last_beat_at`, `version` | `packages/database/src/schema/worker-heartbeats.schema.ts` | 2026-10-17 | A coluna `model_agents jsonb NULL` do plan D6 se aplica sem ajuste |
| `users.id` é `uuid` PK | `packages/database/src/schema/users.schema.ts` | 2026-10-17 | A FK do plan D6 está correta |

Divergências com o plan, corrigidas nele: id do Haiku 5.5 e campo/limites do Gemini. Nenhuma outra.

### T0.2 — Adendo ao ADR 0002 (2026-10-17)

Seção "Agentes de modelo (spec 015)" em `docs/adr/0002-contrato-do-motor-de-estrategias.md` (M1 a M11), copiada do plan D2 a D9
e dos RF05 a RF16; nenhuma decisão nova. Pendência: revisão do adendo por `architect` (opus) não rodou nesta sessão.

## Fase 1 — Domínio puro (`packages/model-agents`)

Gates no WSL, espelho próprio `~/gates/ativada-spec15`.

### T1.1 — Pacote, catálogo, esquemas e resultado da porta (2026-10-17)

- Pacote `@ativada/model-agents` (workspace, `zod` 4.6.5 exato como o motor, sem dependência nova de fora; `bun.lock` ganhou só a entrada do pacote).
- `model-agent-catalog.constant.ts`, `model-opinion.schema.ts`, `prompt-input.schema.ts`, `model-call-result.types.ts`.
- Testes: `test/model-agents-schemas.contract.test.ts` (bordas 0/100, 160/161, chave a mais, `userId` e outras chaves recusadas) e `test/model-agents-boundary.contract.test.ts` (só `zod`, `node:crypto` e os dois pacotes da casa; sem relógio, I/O, `console`, `as`, `export default` nem regex com lookahead; sondas).
- Gates: `bun run typecheck` OK; `bun run lint` OK; `bun run format:check` OK; 33 testes passam (2 arquivos).
