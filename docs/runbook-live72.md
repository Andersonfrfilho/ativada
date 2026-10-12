# Runbook — simulação ao vivo de 72 h (T6.3)

Critério 4 da spec 001: "simulação ao vivo roda 72 h sem intervenção, sobrevive a um reinício e gera
alertas". Dados REAIS da Binance (públicos, sem chave), dinheiro fictício, uma única simulação
`live_paper` do Placar clássico em BTCUSDT 1h com 10 000 USDT fictícios.

**O notebook precisa ficar ligado e na tomada durante as 72 h.** O supervisor roda sob
`caffeinate -dimsu`, que impede a suspensão por inatividade; `-s` só vale na tomada, e fechar a tampa
sem monitor externo suspende o Mac mesmo assim.

## O que existe

| Peça | Onde |
|---|---|
| Infra (Postgres, Keycloak, Mailpit) | compose `ativada-live72`, volumes nomeados persistentes, `envs/env.live72`, portas 565xx (banco 56532, Keycloak 56580, API 56501, sumidouro do Telegram 56504) |
| Processos `api`, `worker`, sumidouro do Telegram e o `cron` periódico | `scripts/live72/supervisor.ts`, mantido por um LaunchAgent (`com.adatechnology.ativada-live72`, KeepAlive, volta no login) |
| Logs JSON com rotação (20 MB x 5) | `~/.ativada-live72/logs/` |
| Pids | `~/.ativada-live72/run/` |
| Eventos do supervisor e dos comandos | `~/.ativada-live72/events.jsonl` |
| Dados da simulação (sem segredo) | `~/.ativada-live72/run.json` |
| Relatório | `~/.ativada-live72/report.md` |

O usuário de teste e a credencial de DESENVOLVIMENTO estão em `envs/env.live72`
(`LIVE72_USERNAME`, `LIVE72_USER_EMAIL`, `LIVE72_USER_PASSWORD`); a senha nunca é impressa nem entra em
log. Keycloak local: `http://127.0.0.1:56580`, realm `ativada`.

## Iniciar

```bash
make live72-up       # idempotente: infra, migrations, LaunchAgent, usuário, backfill de candles e Fear & Greed
make live72-start    # cria a meta e A simulação (recusa uma segunda) e grava run.json
```

O `start` confere o aquecimento exigido pela estratégia, cria a simulação pela API autenticada (nada de
SQL) e marca o reinício controlado do worker (SIGKILL) para início + 36 h. O supervisor o executa
sozinho e registra a hora em `events.jsonl`; a retomada vem do checkpoint e o relatório confere que nada
foi duplicado.

## Acompanhar

```bash
make live72-status   # texto curto: tempo, candles, sinais, ordens, posição, patrimônio, alertas,
                     # processos, queda/reinício, idade do último tick do ticker, banco e disco
```

Painel opcional (não faz parte do aceite e não foi verificado nesta execução): o login do Keycloak desta
infra aceita `http://127.0.0.1:56500` como origem, então `bun --env-file=envs/env.live72 run --cwd
apps/frontend-ativada dev` serve o painel nessa porta.

## Parar

```bash
make live72-stop                 # descarrega o agente e para tudo; containers e dados ficam
make live72-down CONFIRM=1       # remove agente, containers, volumes e ~/.ativada-live72
```

`stop` e `down` contam como intervenção humana no relatório (assim como um `up` ou `start` depois do
início): o veredito fica INCONCLUSIVO, porque o critério exige zero intervenção.

## Se o Mac dormir, reiniciar ou o Docker cair

- **Dormir**: a suspensão é impedida enquanto o supervisor vive. Se ainda assim o Mac dormir, ao acordar
  o worker recupera os candles perdidos pelo REST (janela de retrocesso de 168 h) e a simulação
  continua; o `status` mostra `waitingForData` enquanto houver buraco.
- **Reiniciar ou novo login**: o LaunchAgent (`RunAtLoad`) sobe o supervisor sozinho. Ele espera o
  Postgres responder (tenta `docker compose up -d` do projeto `ativada-live72` de tempos em tempos,
  então o Docker Desktop precisa abrir no login) e reinicia os processos. Cada partida fica como
  `supervisor_start` em `events.jsonl` e aparece no relatório como reinício do supervisor.
- **Queda de um processo**: reinício com espera crescente (2 s a 1 min), registrado como `child_exit`.
- **Não mude o código do repositório** (nem de branch) durante as 72 h: o worker e a API reiniciados
  carregam o que estiver no disco.

## Pedir o relatório

Quando passar o término previsto (início + 72 h, ver `run.json`), peça à sessão "só T6.3 relatório" ou
rode:

```bash
make live72-report   # grava ~/.ativada-live72/report.md e imprime o texto para o evidence.md
```

O relatório traz: duração real, intervenção humana, reinício controlado (contagens antes e depois,
duplicidade por chave única), candles esperados x avaliados (buracos), alertas (contagem e amostra sem
dado pessoal), patrimônio inicial/final/máximo/mínimo, drawdown, comparação com comprar e segurar, erros
dos logs por código e o veredito do critério 4 (APROVADO, REPROVADO ou INCONCLUSIVO, com o motivo).
Antes das 72 h o veredito é INCONCLUSIVO por definição.

## O que NÃO é coberto

- **Telegram real**: o worker só enfileira alerta de sinal quando existe `TELEGRAM_BOT_TOKEN` e o dono
  tem chat vinculado. Esta infra usa um token FALSO, vincula um chat FALSO pelo webhook da própria API e
  aponta a "Bot API" para um sumidouro local (`scripts/live72/telegram-sink.ts`), que só responde `ok`.
  Os alertas são gerados e gravados na caixa de saída `alerts` (e aparecem no painel); a entrega ao
  Telegram de verdade não é exercitada, e a API real nunca é chamada.
- **Deploy/produção**: nada aqui sobe para Railway; é só a máquina do responsável.
- **Execução real de ordens**: não existe; é simulação com saldo fictício.
- **Meta como encerramento**: a simulação está atrelada a uma meta (+50% / -50% em 90 dias) escolhida de
  propósito para não encerrá-la antes das 72 h; se mesmo assim ela encerrar, o veredito é INCONCLUSIVO.
