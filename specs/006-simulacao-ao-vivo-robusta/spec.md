# Spec 006 — Simulação ao vivo robusta

## 1. Problema

Em 2026-10-13 o usuário passou um dia com uma simulação ao vivo "rodando" e não viu nenhuma operação. Três causas:

- **(A) A simulação só olha o mercado uma vez por dia.** "Simular esta meta" (`apps/frontend-ativada/src/goals/RankingCard.component.tsx`)
  cria a `live_paper` sempre com `GOAL_TIMEFRAME = '1d'` (`src/goals/goal.constant.ts`). A vela diária fecha às 00:00 UTC
  (21h em Brasília); até lá, nada acontece. A tela diz só "Aguardando o primeiro candle" (`ActiveGoalCard`, `BalanceCard`),
  sem dizer **quando** a primeira vela fecha. A API já aceita 15m/1h/4h/1d para `live_paper`, mas o painel não oferece a
  escolha. E o ranking das metas é calculado só em velas diárias (`GOAL_EVALUATION_TIMEFRAME`, `apps/api-ativada/src/goals/goal.constant.ts`):
  simular em 1h **não** muda o veredito da meta. A tela precisa dizer isso.
- **(B) O worker não se recupera quando o banco cai e volta.** O Postgres do Docker reiniciou (o computador dormiu). O worker
  (`apps/worker-ativada`) registrou milhares de "live tick failed", "alert dispatch failed" e "gap recovery failed" e nunca
  voltou sozinho; só reiniciando o processo. O cliente é um `new Bun.SQL(url)` aberto uma vez (`packages/database/src/database-handle.ts`),
  sem regra de reconexão nossa. Os logs trazem só `errorName` ("PostgresError"), sem o `code`, então ninguém sabe a causa.
  `/v1/health` da API responde `ok` sem olhar o banco. Ninguém avisou o dono que a simulação dele estava parada.
- **(C) Subir o ambiente local é feito à mão** por scripts em `/tmp` fora do repositório. O Docker Desktop só publicou a
  porta do Postgres depois de reiniciado, e não há roteiro para diagnosticar "banco inacessível".

## 2. Objetivo

> A pessoa clica em "Simular esta meta", escolhe **de quanto em quanto tempo a simulação olha o mercado** (padrão: a cada
> 1 hora), e vê: "A simulação olha o mercado a cada 1 hora. Primeira vela fecha às 15:00 (horário de Brasília)." Ao lado,
> o aviso honesto: "O ranking da meta é feito com velas diárias. Simular em velas menores é um teste ao vivo e não muda o
> ranking."
>
> Se o banco cair e voltar, o worker e a API voltam sozinhos em até ~1 minuto, sem reiniciar nada. Se a simulação ficar
> parada mais de 15 minutos além do esperado, o dono vê uma faixa no painel ("Sua simulação está parada desde 14:05. Já
> estamos tentando retomar.") e recebe uma mensagem no Telegram (se ligado). Quando volta, outra mensagem: "voltou".
>
> Para desenvolver: `scripts/dev-up.sh` (ou `.ps1`) sobe infra, API, worker e painel com as moedas atuais, e o
> `docs/runbook-dev-local.md` diz o que fazer quando "o banco não responde".

Continua sendo simulação: nenhum dinheiro real, nenhuma ordem real.

## 3. Requisitos funcionais

### Vela da simulação (A)

- **RF01** — "Simular esta meta" ganha um seletor **"De quanto em quanto tempo olhar o mercado"** com 1 hora, 4 horas e
  1 dia; **padrão 1 hora** (D1). 15 minutos fica num item "Mais opções" e mostra o aviso de taxas (RF03) antes de criar.
- **RF02** — Cada opção mostra uma frase simples: "A cada 1 hora: até 24 decisões por dia." / "A cada 4 horas: até 6 por
  dia." / "Uma vez por dia, às 21:00 (horário de Brasília)." O horário vem do fuso do usuário (`useUserTimeZone`).
- **RF03** — Aviso fixo junto do seletor: "O ranking desta meta é calculado com velas diárias. Simular com velas menores é
  um teste ao vivo: o resultado pode ser diferente e não muda o ranking." Em 15 minutos, acrescenta: "Com velas de 15 min
  a estratégia opera mais vezes e as taxas pesam mais."
- **RF04** — O mesmo seletor existe na tela da meta (`/metas/:goalId`), onde também se pode iniciar a simulação. A escolha
  é por simulação (fica em `runs.timeframe`); não muda a meta.
- **RF05** — Antes de criar, o painel mostra quantas simulações ao vivo a pessoa já tem ("3 de 5") e, se já existe uma
  simulação **ativa** com o mesmo par, estratégia e vela, avisa "Você já tem esta simulação rodando" com link para ela, sem
  bloquear outra vela (D4). No limite (5), o botão fica desabilitado com o texto "Você chegou ao limite de 5 simulações ao
  vivo. Pare uma para começar outra." (a API continua respondendo `409 LIVE_RUN_LIMIT_REACHED`).
- **RF06** — Estado "**Aguardando a primeira vela, que fecha às HH:MM**" (fuso do usuário, com "hoje"/"amanhã") na Visão
  geral (`BalanceCard`), no cartão de meta ativa (`ActiveGoalCard`) e no detalhe da simulação. Substitui "Aguardando o
  primeiro candle". O horário é o fim da vela em curso no momento da criação; passado esse horário sem passo, a tela troca
  para o estado de parada (RF11).
- **RF07** — O detalhe e o cartão da simulação mostram a vela em linguagem simples ("olha o mercado a cada 1 hora") e "última
  decisão às HH:MM · próxima às HH:MM".

### Reconexão e saúde (B)

- **RF08** — Worker e API **se recuperam sozinhos** quando o banco cai e volta: depois da primeira falha de conexão, as
  consultas seguintes usam conexão nova; enquanto o banco não volta, cada laço espera com backoff exponencial com sorteio
  (1 s, 2 s, 4 s… teto de 30 s) em vez de repetir a cada ronda e encher o log. Volta → o laço segue no ritmo normal na
  ronda seguinte. Nenhum passo, sinal ou alerta é duplicado (o checkpoint por transação já garante; o teste prova).
- **RF09** — **Log do erro com causa e sem PII**: todo erro de banco logado pelo worker e pela API leva `errorName`, `code`
  (SQLSTATE ou código do Bun, ex. `ERR_POSTGRES_CONNECTION_CLOSED`, `57P01`, `ECONNREFUSED`) e `errno` quando houver; nunca
  a mensagem crua, a URL, o usuário, a senha nem parâmetros da consulta. Erros repetidos são resumidos: uma linha na
  primeira falha, uma a cada 60 s com a contagem ("database unavailable", `{ code, failures, sinceMs }`) e uma na volta
  ("database recovered", `{ downtimeMs }`).
- **RF10** — **Readiness honesta.** `GET /v1/health` (público) faz `SELECT 1` com teto de 1 s e responde `200 { status: ok }`
  ou `503 { status: degraded }` sem detalhe (D7). `GET /v1/admin/health` ganha `worker: { lastHeartbeatAt, ageSeconds,
  state: 'alive' | 'stale' | 'unknown' }` e `database` com o último `code` de falha.
- **RF11** — **Batimento do worker.** O worker grava a cada `WORKER_HEARTBEAT_SECONDS` (padrão 15) uma linha
  `worker_heartbeats` (id da instância, `last_beat_at`, versão, contadores agregados das rondas: sem dado de usuário).
  `stale` = mais de 3 batimentos sem gravar. O painel **não tem tela de admin** (conferido em 2026-10-13): o batimento
  aparece só no JSON de `/v1/admin/health`; para o dono, o que importa é a faixa de simulação parada (RF13). Tela de admin
  fica fora do escopo (D12).

### Aviso de simulação parada (B)

- **RF12** — Uma simulação `live_paper` `running` está **parada** quando o último passo esperado não aconteceu: agora >
  fim da última vela que deveria ter sido processada + `LIVE_STALL_GRACE_MINUTES` (padrão 15). Isso cobre worker caído,
  banco fora e stream mudo. Não conta como parada a espera por dado já marcada (`waitingForData`), que tem texto próprio.
- **RF13** — **Faixa no painel**: `GET /v1/runs/:id` e a lista trazem `stalledSince` (ms UTC ou ausente). Visão geral,
  cartão de meta ativa e detalhe mostram "Sua simulação está parada desde HH:MM. O sistema está tentando retomar; nenhuma
  operação foi perdida." Quando volta, a faixa some.
- **RF14** — **Mensagem no Telegram** (canal já existente, `alerts`): um alerta `STALL` quando a simulação fica parada e um
  `RESUME` quando volta, **uma vez por episódio** (chave única execução + início do episódio + lado). Só para dono com
  Telegram ligado; respeita `ALERT_TELEGRAM_DAILY_LIMIT_PER_USER`. Quem detecta é a **API** (D9), porque o worker é
  justamente quem pode estar parado; se o banco estiver fora, o alerta é enfileirado na primeira ronda em que o banco volta
  e a parada ainda durar, e a faixa do painel aparece assim que a API lê o banco.
- **RF15** — Sem mensageria nova: a fila é o banco (`alerts` + `pg_notify`), como no ADR 0002. A T0.1 registra isso.

### Ambiente local (C)

- **RF16** — `scripts/dev-up.sh` e `scripts/dev-up.ps1`: carregam `envs/env.dev` (e `env.dev.local` se existir), conferem
  Docker, sobem a infra (`make up`), esperam a porta do Postgres responder (com teto e mensagem clara), rodam migrations,
  sobem API, worker e painel em segundo plano com logs em `.dev/logs/` e PIDs em `.dev/pids/`; `dev-down` para os
  processos (não apaga volumes). As moedas vêm de `MARKET_SYMBOLS`/`VITE_MARKET_SYMBOLS` do env, nunca fixas no script.
  Nunca imprimem valores de segredo.
- **RF17** — `docs/runbook-dev-local.md`: subir e descer; "o banco não responde" passo a passo (`docker ps` com `PORTS`
  vazio → reiniciar o Docker Desktop; `Test-NetConnection localhost -Port 56432` / `nc -z`; `/v1/admin/health`; o que os
  logs novos significam); o que esperar do worker depois que o banco volta. `docs/runbook-live72.md` ganha um link para ele.

## 4. Requisitos não funcionais

- **RNF01 — Recuperação medida.** Banco derrubado por 30 s e religado: worker e API voltam a processar em ≤ 60 s depois que o
  banco aceita conexão, sem reinício, sem passo duplicado; durante a queda, o log tem ≤ 1 linha por laço a cada 60 s.
- **RNF02 — Sem PII e sem segredo em log** (security.md §1, §4). Teste de contrato varre as linhas de log da queda e reprova
  URL, senha, usuário do banco ou mensagem crua.
- **RNF03 — Nada muda no motor.** `packages/strategy-engine` e `packages/run-recording` não mudam.
- **RNF04 — Mudanças aditivas.** Campos novos em `/v1/runs*` e `/v1/admin/health` são opcionais; `/v1/health` passa a poder
  responder `503` (documentado no OpenAPI). Migration nova é aditiva com `.rollback.sql`.
- **RNF05 — Painel.** Mesmas regras da spec 005: 375 px sem rolagem horizontal, foco visível, nunca só cor, ≤ 40 linhas por
  função e ≤ 200 por arquivo, Zod espelhado, horas no fuso do usuário com o deslocamento.
- **RNF06 — Testes no padrão do repo.** Contratos com falha injetada (porta de banco falsa que cai e volta), integração com
  Postgres real derrubado e religado (`docker restart`/`pause`), e mutantes que provam cada regra (reconexão, backoff,
  teto, resumo do log, detecção de parada, alerta único).

## 5. Decisões tomadas por padrão (o usuário pode mudar)

| # | Decisão | Por quê | Alternativa |
|---|---|---|---|
| D1 | Vela padrão da simulação de meta = **1 hora** | Vê a primeira decisão em até 1 h; 4h ainda deixa o leigo esperando; 15m opera demais e paga taxa demais | 4 horas como padrão |
| D2 | Opções 1h, 4h, 1d; **15m escondida** em "Mais opções" com aviso de taxas | Leigo não deve cair no 15m sem saber o custo | Tirar 15m de vez |
| D3 | O ranking **continua só em 1d**; a tela diz isso (RF03) | Mudar o ranking para outras velas é outra spec (custo de CPU, mínimo de janelas) | Ranking por vela (spec futura) |
| D4 | Mesmo par + estratégia em **velas diferentes é permitido**; mesma vela repetida só avisa | São testes diferentes e o teto de 5 já limita | Bloquear duplicata exata (409) |
| D5 | Reconexão = **fechar e reabrir o `Bun.SQL`** atrás de um "porteiro" (`ResilientDatabase`) depois de N falhas de conexão seguidas; backoff 1 s → 30 s com sorteio, sem desistir | A causa exata no Bun 1.3.14 se descobre na T0.1, mas reabrir o cliente funciona em qualquer caso | Só repetir a consulta e confiar no pool |
| D6 | **Sem teto de tentativas** para desistir; teto é só do intervalo (30 s) | O worker deve voltar sozinho mesmo depois de horas | Sair do processo após X min e deixar o supervisor reiniciar |
| D7 | `/v1/health` público responde **503 sem detalhe** com banco fora | Balanceador/supervisor precisa saber; detalhe só no admin | Manter `200` e expor `/v1/ready` separado |
| D8 | Batimento numa tabela nova `worker_heartbeats` (migration 0022) | Funciona com mais de uma instância e a API lê sem falar com o worker | Arquivo local / porta HTTP no worker |
| D9 | Parada detectada **pela API** (varredura a cada 60 s) + faixa no painel **e** Telegram | O worker não pode avisar que está parado; a API já tem o ticker e o laço de alertas de preço | Só faixa no painel |
| D10 | `LIVE_STALL_GRACE_MINUTES` = 15 (5 a 240) | Cobre atraso normal do stream e da recuperação de lacuna sem alarme falso | 30 min |
| D11 | Scripts `dev-up` em **bash e PowerShell**; logs em `.dev/` (no `.gitignore`) | O usuário usa Windows e WSL | Só bash |
| D12 | **Sem tela de admin nova**: batimento só no `/v1/admin/health` | O painel não tem área de admin; o dono vê a faixa de parada | Cartão "Saúde do sistema" para o grupo `admins` |

## 6. Fora do escopo

- Mensageria nova (Redis, RabbitMQ, BullMQ): a fila continua sendo o banco (ADR 0002).
- Ranking de metas em velas menores que 1 dia.
- Supervisor de processo em produção (systemd, Railway restart policy) — fica com a A3 pendente do responsável.
- Mudar a simulação de uma vela para outra depois de criada (pare e crie outra).
- Ordens reais e o modo `live` (spec 002).

## 7. Critérios de aceite

1. "Simular esta meta" com o padrão cria `live_paper` em `1h`; a tela mostra a frase do RF02, o aviso do RF03 e "Aguardando
   a primeira vela, que fecha às HH:MM" no fuso do usuário; em até 1 h aparece a primeira decisão.
2. Com 5 simulações ativas o botão fica desabilitado com o texto do RF05; a mesma simulação na mesma vela mostra o aviso e o link.
3. `make db-outage-test`: Postgres real derrubado por 30 s com worker e API vivos → ambos voltam em ≤ 60 s, nenhum passo
   duplicado (contagem de `fills`/`signals` igual à de uma execução contínua), log da queda com `code` e sem PII.
4. Durante a queda, `GET /v1/health` = `503`; depois, `200`. `GET /v1/admin/health` mostra `worker.state = stale` com o worker
   morto e `alive` depois.
5. Simulação sem passo por mais de 15 min além do esperado → `stalledSince` na API, faixa no painel e **um** alerta `STALL`
   no Telegram falso; ao voltar, **um** `RESUME`. Repetir a ronda não duplica.
6. Mutantes de reconexão, backoff, resumo de log, detecção de parada e alerta único: todos mortos.
7. `scripts/dev-up.sh` em WSL sobe tudo do zero com as moedas do env; o runbook resolve o caso "PORTS vazio".
8. 375 px sem rolagem horizontal nos dois temas; uma captura final em `evidence.md`.

## 8. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| Causa real no Bun.SQL é outra (ex.: pool preso numa promessa que nunca resolve) | Reabrir não basta | T0.1 reproduz com `docker restart` antes de decidir; teto de tempo por consulta (`AbortSignal`/timeout) no porteiro |
| Reabrir o cliente com transação em voo | Passo pela metade | Transação inteira ou nada (já é); o porteiro só reabre entre rondas, nunca dentro de `runInBatch` |
| Alarme falso de parada em vela 1d | Telegram à toa | Regra usa o fim da vela esperada + carência, não o relógio de parede puro; teste com 1d |
| Escutador LISTEN e cliente principal reconectando em ritmos diferentes | `resync` em excesso | O escutador já tem backoff próprio; o teste da queda confere `resync` único por episódio |
| Seletor de vela confundir o leigo | Escolhe 15m sem entender | 15m escondido, frase por opção e aviso de taxas |
