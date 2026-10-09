# Spec 002 — Execução em corretora

**Status:** rascunho para validação · **Etapa:** 2 de 2 · **Depende de:** spec 001 fechada e gate
T6.4 registrado pelo operador

## Problema

Uma estratégia validada na simulação precisa ser executada de verdade, por API, sem que um defeito,
uma chave vazada ou uma queda de conexão causem perda além do que o operador aceitou. A execução
real sempre sai pior que a simulação (slippage, latência, ordem que não preenche) e essa diferença
precisa ser medida, não suposta.

## Objetivo

Um executor que leva os sinais da spec 001 a uma corretora por API, com travas obrigatórias,
percorrendo testnet → sombra → real pequeno, sempre com uma pessoa decidindo cada passagem.

## Fora de escopo

- Futuros, margem, alavancagem e venda a descoberto.
- Saque, transferência e qualquer movimentação fora de compra e venda à vista.
- Custódia. O sistema nunca guarda dinheiro nem moeda: cada usuário conecta a **própria** conta de
  corretora, e o robô dele opera só essa conta, dentro dos tetos que ele mesmo definiu.
- Cálculo do imposto devido: o sistema entrega o registro; a apuração é do contador.

## Requisitos funcionais

### RF01 — Gateway de corretora
- Porta `ExchangeGateway` na aplicação; implementação com **CCXT**.
- Primeira corretora: Binance (testnet e real). Mercado Bitcoin e Foxbit depois, só por config.
- Operações: saldo, criar ordem limitada, cancelar, consultar ordens abertas e preenchimentos,
  restrições da chave.

### RF02 — Modos
- `backtest` · `paper` (spec 001) · `testnet` · `live`.
- Padrão é `paper`, e o modo é **por usuário**. `live` exige **as três**: a plataforma com `live`
  habilitado (`TRADING_LIVE_ENABLED=true`), chave real cadastrada pelo próprio usuário, e o próprio
  usuário armando (`POST /v1/execution/arm` com confirmação digitada e TOTP) a cada início do
  processo.
- Nenhum usuário, nem o administrador, arma a execução de outro. O administrador só tem o kill
  switch global (RF05), que desarma.
- Mudança de modo é registrada com quem, quando e de onde.

### RF03 — Chave segura, por usuário
- Cada usuário cadastra a própria chave de API na tela de conta. A chave é **só escrita**: depois de
  salva, nunca volta em resposta de API nem aparece na tela (só os 4 últimos caracteres).
- Guardada cifrada (AES-256-GCM) com chave de aplicação fora do banco; decifrada só em memória no
  executor, no momento do uso.
- Ao cadastrar e a cada armar, o sistema consulta as restrições da chave e **recusa** se ela permitir
  saque, ou se não tiver restrição de IP em `live`. A tela mostra o IP de saída a liberar.
- Cadastrar, trocar ou remover chave exige reautenticação, definida como access token com `acr = 2`
  (senha + TOTP) **e** `auth_time ≤ 5 min`, e gera evento de auditoria (ADR 0001 §b, §i).
- TOTP é obrigatório para qualquer usuário que cadastre chave.

### RF04 — Tetos (circuit breaker)
Obrigatórios, sem padrão "ilimitado", configurados por cada usuário dentro de um teto máximo da
plataforma:

| Teto | Exemplo |
|---|---|
| Valor máximo por ordem | R$ 200 |
| Ordens por dia | 10 |
| Perda máxima no dia | 3% do saldo do início do dia |
| Perda máxima total (desde que armou) | 10% |
| Exposição máxima aberta | 50% do saldo |

Teto atingido → cancela ordens abertas, para de abrir posição, alerta no Telegram e exige rearmar.
Aumentar teto é decisão humana registrada.

### RF05 — Kill switch
- `POST /v1/execution/kill` e comando `/stop` no Telegram (só do chat vinculado ao usuário; o webhook
  valida o `secret_token` do Telegram antes de ler o comando): cancela as ordens abertas **daquele
  usuário** e desarma.
- Kill switch global do administrador (`POST /v1/admin/execution/kill-all`): **só grava um sinal global**
  e audita; quem cancela as ordens e desarma é o processo executor, sessão a sessão, com
  o escopo que o pacote devolve com a linha, igual ao worker. A resposta é só agregada (quantos desarmados, quantas
  falhas), sem saldo, ordens ou ids. Não arma ninguém de volta. **Proibido** `kill/:userId` ou qualquer
  rota admin que receba id de usuário e atue sobre a execução dele (ADR 0001 §j).
- Zerar posições é opcional e desligado por padrão.
- Responde em até 5 s e confirma o estado final consultando a corretora.

### RF06 — Ordens
- Só ordem limitada, com preço do sinal ± tolerância configurável e expiração.
- Ordem a mercado só no stop, e só se o operador ligar essa opção.
- Respeita incremento mínimo de preço, quantidade e valor mínimo da corretora (filtros do par).

### RF07 — Idempotência
- `clientOrderId` determinístico derivado do id do sinal.
- Antes de reenviar qualquer ordem após erro ou reconexão, consulta a corretora por esse id.
- Um sinal nunca gera duas ordens.

### RF08 — Reconciliação
- A cada N minutos e no boot: saldo e ordens da corretora × registro interno.
- Divergência acima da tolerância → desarma e alerta.

### RF09 — Sombra
- Toda execução real roda em paralelo uma simulação `paper` da mesma estratégia.
- Relatório diário: diferença de preço médio, ordens não preenchidas, diferença de resultado.

### RF10 — Registro fiscal
- Cada preenchimento com: data e hora, par, lado, quantidade, preço, taxa, cotação USDT/BRL do
  momento e valor em R$.
- Exportação CSV mensal. O sistema não calcula imposto.

### RF11 — Trilha de auditoria
Armar, desarmar, kill, mudança de teto, mudança de modo, ordem e preenchimento — com ator, origem e
horário.

## Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF01 | Do candle fechado à ordem enviada em menos de 3 s |
| RNF02 | Queda de conexão nunca deixa ordem duplicada (prova por teste com falha injetada) |
| RNF03 | Segredos redigidos no logger (`apiKey`, `secret`, `signature`, token do Telegram) |
| RNF04 | Rotas de execução na API exigem `Bearer` com `acr = 2` e `auth_time` recente (≤ 5 min) para armar, trocar chave e mudar teto; o processo executor não tem porta pública (escuta só em 127.0.0.1 ou nenhuma) e recebe comandos pelo banco |
| RNF05 | O processo de execução é separado do da simulação; parar um não para o outro |
| RNF06 | Falha na conta de um usuário (chave revogada, saldo insuficiente) não afeta a execução dos outros |
| RNF07 | Toda rota de execução com contrato negativo entre usuários |

## Pendência regulatória (bloqueia a Fase 6)

Executar ordens na conta de clientes é mais sensível que só simular. Antes de qualquer usuário além
do próprio responsável pelo produto armar o `live`, um advogado precisa validar: enquadramento na
CVM (consultoria, administração de carteira), termos de uso e de responsabilidade, e obrigações da
Receita para operações em corretora estrangeira. Registro em `evidence.md`.

## Etapas de subida (cada uma é gate humano)

1. **Testnet** — 7 dias contínuos sem erro de execução, sem ordem duplicada, kill switch testado.
2. **Sombra em real, sem ordens** — `live` desarmado, só registrando o que faria por 7 dias.
3. **Real pequeno** — tetos mínimos (ex.: R$ 50 por ordem) por 30 dias.
4. **Ajuste** — aumentar tetos só se o real ficar dentro da tolerância da sombra.

## Critérios de aceite

1. Boot recusa chave com permissão de saque (teste com resposta simulada).
2. Teste com falha injetada entre envio e resposta não gera ordem duplicada.
3. Cada teto do RF04 tem teste que o dispara e prova o desarme.
4. Kill switch cancela ordens na testnet em menos de 5 s.
5. 7 dias de testnet registrados em `evidence.md`.

## Responsabilidades

A I.A. que desenvolve este sistema escreve e testa o código, inclusive contra a testnet. **Não**
cria nem manuseia a chave real de ninguém, **não** arma o modo `live` e **não** envia ordem com
dinheiro real. Cada usuário cadastra a própria chave e arma a própria execução.
