# Runbook — ambiente local de desenvolvimento

Como subir e descer o AtivAdA na sua máquina (Windows PowerShell 7, WSL, Linux ou macOS) e o que fazer
quando o banco "não responde". Valores de desenvolvimento ficam em `envs/env.dev`; nenhum script daqui
imprime segredo.

## 1. Subir e descer

| | Windows (PowerShell 7) | WSL / Linux / macOS (bash) |
|---|---|---|
| Subir | `pwsh scripts/dev-up.ps1` | `scripts/dev-up.sh` |
| Descer os processos | `pwsh scripts/dev-down.ps1` | `scripts/dev-down.sh` |
| Descer também os containers | `pwsh scripts/dev-down.ps1 -Infra` | `scripts/dev-down.sh --infra` |
| Ver o que faria, sem executar | acrescente `-DryRun` | acrescente `--dry-run` |

Os scripts `.sh` recusam o Git Bash/MSYS (o pid e o `ps` são do emulador): no Windows use sempre o `.ps1`. O env é lido
linha a linha, sem `source`: um `# Runbook — ambiente local de desenvolvimento

Como subir e descer o AtivAdA na sua máquina (Windows PowerShell 7, WSL, Linux ou macOS) e o que fazer
quando o banco "não responde". Valores de desenvolvimento ficam em `envs/env.dev`; nenhum script daqui
imprime segredo.

## 1. Subir e descer

| | Windows (PowerShell 7) | WSL / Linux / macOS (bash) |
|---|---|---|
| Subir | `pwsh scripts/dev-up.ps1` | `scripts/dev-up.sh` |
| Descer os processos | `pwsh scripts/dev-down.ps1` | `scripts/dev-down.sh` |
| Descer também os containers | `pwsh scripts/dev-down.ps1 -Infra` | `scripts/dev-down.sh --infra` |
 na senha vale literalmente.

O `dev-up` faz, nesta ordem: confere o Docker; `docker compose --env-file envs/env.dev -f compose.yaml up -d --wait`;
espera a porta do Postgres responder (até 60 s); aplica as migrations; sobe **API**, **worker** e **painel** em segundo
plano. Rodar de novo não duplica nada: se o processo registrado em `.dev/pids/` está vivo, ele é mantido; se a porta
já está ocupada por outro processo, o script avisa e não sobe aquele serviço.

**Não canalize a saída do `dev-up.ps1`** (`pwsh scripts/dev-up.ps1 | ...`): os processos filhos herdam o cano e o comando só termina quando eles morrerem. Para capturar, redirecione para arquivo (`pwsh scripts/dev-up.ps1 > dev-up.txt`) ou use `Start-Process -RedirectStandardOutput`.

O `dev-down` para só os processos registrados em `.dev/pids/` (nunca por nome de processo) e **não apaga volumes**.
Sem `--infra` ele só sugere derrubar os containers (em terminal interativo, pergunta).

Endereços ao final:

| O quê | Endereço |
|---|---|
| Painel | <http://127.0.0.1:56100> |
| API (saúde) | <http://127.0.0.1:56101/v1/health> |
| Keycloak | <http://127.0.0.1:56180> |
| Mailpit | <http://127.0.0.1:56126> |

`envs/env.dev.local` (se existir) é carregado depois do `env.dev` e vale mais; `envs/*.local` não vai para o git.

## 2. "O banco não responde"

Sintoma: o `dev-up` termina com "o Postgres não respondeu em 127.0.0.1:56432", ou a API e o worker logam
`database unavailable` e não voltam.

1. Veja o container e a coluna **PORTS**:

   ```bash
   docker ps --filter name=ativada-dev-postgres
   ```

   - `PORTS` com `127.0.0.1:56432->5432/tcp`: a porta está publicada; o problema é outro (passe ao item 3).
   - `PORTS` **vazia** com o container `healthy`: o Docker **não publicou a porta** para o seu computador. O Postgres
     está de pé por dentro, mas ninguém de fora o alcança.

2. Confirme que a porta não responde:

   ```powershell
   Test-NetConnection 127.0.0.1 -Port 56432     # Windows: TcpTestSucceeded : False
   ```

   ```bash
   nc -z 127.0.0.1 56432 && echo aberta || echo fechada     # WSL / Linux / macOS
   ```

3. **Correção:** reinicie o Docker Desktop (ícone da bandeja → *Restart*; espere o ícone ficar estável) e rode o
   `dev-up` de novo. Os dados estão no volume e voltam. Os scripts **não** reiniciam o Docker nem recriam containers
   sozinhos, de propósito.

   Por que acontece: depois que o computador **suspende** (ou hiberna), o Docker Desktop às vezes volta sem refazer a
   publicação das portas dos containers. O container segue "healthy" pelo próprio `pg_isready` interno, e por isso
   nada acusa o erro.

4. Depois que o banco aceita conexão, **não é preciso reiniciar API nem worker**: eles tentam de novo sozinhos
   (espera crescente com teto de 30 s) e voltam em até cerca de 1 minuto. Confira no item 4 abaixo.

## 3. Onde ficam os logs

`.dev/logs/` (fora do git): `api.log`, `worker.log` e `painel.log`. No Windows, a saída de erro vai para
`api.err.log`, `worker.err.log` e `painel.err.log`. Os pids ficam em `.dev/pids/`.

```bash
tail -f .dev/logs/worker.log          # WSL / Linux / macOS
```

```powershell
Get-Content -Wait .dev\logs\worker.log   # Windows
```

## 4. Saúde: `/v1/health` e `/v1/admin/health`

- **`GET /v1/health`** (público): só diz `ok` (200) ou `degraded` (503). Sem detalhe de propósito; o teste do banco tem
  teto próprio de 1 s. `curl -s http://127.0.0.1:56101/v1/health`.
- **`GET /v1/admin/health`** (exige token de admin): detalhe para diagnóstico.
  - `database`: `state` (`up` ou `down`), `consecutiveFailures`, `downSince`, `lastFailureCode`, `lastFailureAt`. O código
    é só o do erro (por exemplo `ERR_POSTGRES_CONNECTION_CLOSED`), nunca a mensagem do driver.
  - `worker`: `lastHeartbeatAt`, `ageSeconds` e `state`: `alive` (batimento de até 3 intervalos, padrão 15 s cada),
    `stale` (acima disso: worker parado ou sem falar com o banco) ou `unknown` (nunca bateu ou o banco não respondeu).
  - `checks.database`, `listener` e `runs` seguem como antes.

## 5. O que dizem os logs e o painel

| Mensagem | Significado |
|---|---|
| `database unavailable` (nível `error`) | O processo perdeu o banco. Sai **uma linha por laço a cada 60 s**, com `name`, `code` e o número de falhas; nunca a mensagem do driver, URL, usuário ou senha. |
| `database recovered` (nível `info`) | O banco voltou e o processo reconectou sozinho, sem reinício. Só aparece se a queda chegou a ser registrada. |
| Faixa **"Sua simulação está parada desde HH:MM"** no painel | Uma simulação ao vivo deixou de dar o passo esperado por mais de 15 minutos além do fim da vela (worker caído, banco fora ou stream mudo). O sistema tenta retomar e **nenhuma operação é perdida**; a faixa some quando o passo volta. Com Telegram vinculado, chega também um aviso. |
| "Aguardando dados do mercado" | É outra coisa: buraco de velas que o worker ainda recupera. Não é a faixa de parada. |

## 6. Moedas ativas

Por padrão o `dev-up` ativa, no worker, na API e no painel: `BTCUSDT, ETHUSDT, DOGEUSDT, PEPEUSDT, SOLUSDT, XRPUSDT,
BNBUSDT, LINKUSDT, SHIBUSDT`. A lista vai em `MARKET_SYMBOLS` e `VITE_MARKET_SYMBOLS` (a mesma).

Para mudar, do mais forte ao mais fraco:

1. variável `DEV_MARKET_SYMBOLS` na hora de subir: `DEV_MARKET_SYMBOLS=BTCUSDT,ETHUSDT scripts/dev-up.sh` (PowerShell:
   `$env:DEV_MARKET_SYMBOLS='BTCUSDT,ETHUSDT'; pwsh scripts/dev-up.ps1`);
2. `MARKET_SYMBOLS=...` em `envs/env.dev.local`;
3. a lista padrão em `scripts/dev-lib.sh` e `scripts/dev-lib.ps1` (mantenha as duas iguais; um teste confere).

Só entra par com filtro de preço e passo conhecido em `packages/market-data-crypto/src/symbol-filters.constant.ts`
(BTCUSDT e ETHUSDT são o padrão do motor); par sem filtro reprova o boot. Depois de mudar, rode `dev-down` e `dev-up`.
Pares novos precisam de candles: o `backfill-candles` do cron (`CRON_TASKS=backfill-candles`) os baixa.
