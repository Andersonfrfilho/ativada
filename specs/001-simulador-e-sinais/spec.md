# Spec 001 — Simulador e sinais

**Status:** rascunho para validação · **Etapa:** 1 de 2 · **Depende de:** nada

## Problema

Queremos testar ideias de operação com criptomoedas — rápidas (horas) e longas (semanas) — sem
arriscar dinheiro. Precisamos saber, para uma estratégia: quanto um valor imaginário viraria, por
quanto tempo ele se sustenta, quando ela mandaria comprar ou vender, e se ela é melhor do que
simplesmente comprar e segurar. Hoje isso exige planilha manual e é fácil se enganar com resultado
que só funciona no passado.

## Objetivo

Um sistema que, sobre preço real de mercado:

1. roda estratégias definidas por regras sobre o histórico (backtest) e valida fora da amostra
   (walk-forward);
2. acompanha uma carteira fictícia ao vivo, executando a estratégia como se fosse de verdade;
3. avisa compra e venda com o motivo e o histórico de acerto da regra;
4. mostra tudo num painel.

## Fora de escopo (desta spec)

- Ordem em corretora, com dinheiro real ou de testnet — é a spec 002.
- Machine learning como fonte de sinal (fase posterior, entra como mais um voto).
- Cobrança, planos e assinatura.
- Futuros, margem e venda a descoberto. Só mercado à vista, posição comprada ou zerada.

## Personas

- **Usuário** — tem login próprio; cria e ajusta as próprias estratégias, roda backtests, acompanha
  as próprias simulações e recebe os próprios alertas. Não vê nada de outro usuário.
- **Administrador** — gerencia contas (convidar, bloquear) e vê a saúde do sistema; **não** vê
  estratégias, carteiras nem alertas dos usuários.

## Requisitos funcionais

### RF00 — Contas e login
- Login por e-mail e senha via Keycloak (OIDC, fluxo Authorization Code + PKCE), com recuperação de
  senha e verificação de e-mail. Segundo fator (TOTP) disponível e obrigatório para administrador.
- Access token curto (≤ 15 min) e refresh rotativo; refresh em cookie `HttpOnly`, nunca em
  `localStorage`. A API faz o papel de *token handler* (troca o código do login e guarda o refresh no
  cookie), com cliente confidencial no Keycloak (ADR 0001 §a).
- Cadastro por convite na etapa 1 (o administrador convida); cadastro aberto fica para depois.
- O administrador bloqueia e desbloqueia contas; conta bloqueada não acessa nada (`403`) e tem as
  conexões em tempo real encerradas.
- Cada usuário tem preferências próprias: moeda de exibição (R$/US$), fuso, canal de alerta
  (painel, Telegram) e o próprio chat do Telegram, vinculado por código de confirmação.

### RF00b — Isolamento entre usuários
- Estratégias, versões, execuções, sinais, operações, carteiras simuladas, alertas e exportações
  pertencem a um usuário. O `userId` vem **só** do token, nunca do payload.
- Toda consulta e alteração é filtrada pelo dono (autorização por objeto). Acesso ao recurso de
  outro usuário responde `404`, sem revelar que ele existe.
- Candles e sentimento de mercado são compartilhados (dado público, não pertence a ninguém).
- Cada usuário tem tetos de uso: simulações ao vivo ativas (padrão 5) e walk-forwards simultâneos
  (padrão 1), para que um usuário não esgote a máquina dos outros.

### RF01 — Dados de mercado
- Candles da API pública da Binance (sem chave), mercado à vista.
- Pares configuráveis; padrão `BTC/USDT` e `ETH/USDT`.
- Timeframes `15m`, `1h`, `4h`, `1d`.
- Backfill de pelo menos 2 anos por par e timeframe, retomável.
- Detecção e preenchimento de lacunas; candle aberto nunca é gravado como fechado.
- Índice Fear & Greed diário (alternative.me) como dado opcional.

### RF02 — Indicadores
Médias (SMA/EMA), MACD, Donchian, RSI, Bandas de Bollinger, z-score, VWAP, OBV, ADX e ATR, todos
parametrizáveis. Cada indicador tem teste com valores de referência conferidos contra fonte externa.

### RF03 — Estratégia declarativa
- Uma estratégia é uma configuração validada por schema: par, timeframe, famílias ligadas com seus
  parâmetros, filtro de regime, limiar de pontuação e parâmetros de risco.
- Toda alteração gera uma **nova versão**; resultados ficam presos à versão que os produziu.
- Uma estratégia de exemplo vem pronta ("Placar clássico", ver plan.md §4).

### RF04 — Placar de sinais
- Cada família vota `+1` (compra), `0` (neutro) ou `−1` (venda) no fechamento de cada candle.
- O **regime** (ADX) pondera: em tendência, pesa a família de tendência; em lateral, pesa reversão.
- Pontuação ≥ limiar de compra → sinal `BUY`; ≤ limiar de venda → `SELL`; senão `HOLD`.
- Todo sinal guarda os votos, os valores dos indicadores e um texto de motivo legível
  ("Compra 3/4: tendência, MACD e volume confirmam; RSI neutro").

### RF05 — Risco
- Stop e alvo por múltiplo do ATR no momento da entrada.
- Tamanho da posição pelo risco: arriscar no máximo `riskPerTrade` (padrão 1%) do saldo até o stop.
- Exposição máxima por par e total.
- Uma posição aberta por par por estratégia.

### RF06 — Corretora simulada
- Carteira com saldo inicial imaginário (padrão R$ 10.000 equivalentes em USDT, configurável).
- Taxa por ordem (padrão 0,1%) e slippage (padrão 0,05%) configuráveis e sempre aplicados.
- Decisão no fechamento do candle `t`, execução na abertura de `t+1` ± slippage.
- Ordem limitada: preenche se o candle cruzar o preço; expira após N candles.
- Stop e alvo tocados no mesmo candle: considera o stop (lado pior).

### RF07 — Backtest
- Entrada: estratégia (versão), par, timeframe, período, saldo inicial, taxa, slippage.
- Saída: curva de saldo, operações, e métricas — retorno total, retorno anualizado, comparação com
  comprar e segurar, drawdown máximo e duração, Sharpe, Sortino, taxa de acerto, profit factor,
  número de operações, tempo exposto, taxas pagas.
- Mesmo input → mesmo output, sempre (determinístico).

### RF08 — Walk-forward
- Janelas móveis de ajuste e teste (padrão: 6 meses de ajuste, 2 de teste).
- Busca de parâmetros limitada a uma grade declarada (teto de combinações).
- Relatório principal é o **fora da amostra concatenado**.
- Alerta de overfitting quando o resultado fora da amostra fica muito abaixo do de dentro
  (limiar em plan.md).

### RF09 — Simulação ao vivo
- Liga uma estratégia sobre candles ao vivo com carteira fictícia própria.
- Mostra: saldo atual, curva desde o início, comparação com comprar e segurar no mesmo período.
- **Sobrevivência do saldo:** registra o tempo até o saldo cair abaixo de um piso configurável
  (padrão 80% do inicial) e o tempo até dobrar, se acontecer.
- Sobrevive a reinício: retoma do último candle processado sem duplicar operação.

### RF10 — Alertas
- Sinal `BUY`/`SELL` gera alerta no painel e, opcionalmente, no Telegram.
- O alerta traz: par, preço, pontuação, motivo, ação simulada, stop e alvo, e a **taxa de acerto
  histórica daquela versão da regra** (do último walk-forward).
- Sem alerta repetido para o mesmo candle.

### RF11 — Painel
- **Visão geral**: métricas, curva de saldo × comprar e segurar com marcas de compra e venda,
  regras da estratégia, últimas operações, último sinal.
- **Backtests**: criar, listar, comparar duas versões lado a lado.
- **Estratégias**: editar parâmetros (gera versão nova).
- **Alertas**: histórico.
- Aviso permanente: "Simulação — sinais são saída de regras, não recomendação de investimento".
- Funciona em celular (PWA).

### RF12 — Registro
Toda decisão gravada conforme constituição §8, consultável por execução e exportável em CSV.

### RF13 — Metas
- O usuário declara uma meta: **ganho alvo** (%), **prazo** (7, 14, 30, 60 ou 90 dias), **perda
  máxima aceitável** (%) e valor fictício. Ex.: "quero +3% em 30 dias sem perder mais de 5%".
- O sistema testa cada estratégia do usuário (e os exemplos) em cada par habilitado, em **todas as
  janelas desse prazo** dos últimos 2 anos, e mede por combinação:
  - **taxa de chegada**: fração das janelas em que o saldo atingiu o alvo antes do prazo, sem tocar
    a perda máxima;
  - **taxa de stop**: fração das janelas encerradas pela perda máxima;
  - **tempo típico** até o alvo (mediana);
  - a mesma taxa de chegada para **comprar e segurar** daquele par, sempre exibida ao lado.
- Ranking pelas combinações com maior taxa de chegada, desempate pela menor taxa de stop. Para cada
  uma: situação atual (comprado ou aguardando) e o **próximo gatilho** de compra ou venda com a
  distância em % do preço atual.
- O usuário escolhe uma combinação e inicia uma **simulação com meta**: ela vende ao atingir o alvo,
  encerra na perda máxima e mostra progresso, ritmo (no ritmo / abaixo do ritmo) e dias restantes.
- O texto nunca diz "vai ganhar": diz "chegou à meta em X% das janelas do histórico". Taxa de
  chegada usa o histórico **fora da amostra** quando a estratégia tiver parâmetros ajustados por
  walk-forward.
- Meta irreal (ex.: +50% em 7 dias) não é bloqueada: a tela mostra que nenhuma combinação chegou lá
  e quanto se parou no stop.
- Cada combinação traz um **plano de operação**: preço e condição de compra (o preço calculado que
  dispara a regra no próximo fechamento, ou "sinal já ativo"), preço de venda no alvo e no stop (já
  com taxas), condição de venda por sinal e data limite, com um gráfico do preço e dessas linhas.

### RF14 — Alertas de preço
- O usuário cria alertas "subir acima de" / "cair abaixo de" um valor, por par.
- Os preços do plano (compra, alvo, stop) e dos ativos (RF15) viram alerta com um clique.
- Avaliados a cada negociação (stream de ticker da Binance), sem esperar o fechamento do candle.
- Disparam uma vez, no painel e no Telegram do dono, e ficam desligados até ele religar.
- Teto de alertas ligados por usuário (padrão 50).

### RF15 — Seus ativos
- O usuário cadastra as moedas que tem de verdade: par, quantidade e preço médio. Compras novas da
  mesma moeda recalculam o preço médio.
- O painel mostra valor atual (R$), resultado sobre o custo, o que a estratégia ativa diria hoje
  para aquela moeda (manter, sinal de venda, ficar fora) e preços de alvo e stop sobre o preço médio
  (padrão +10% / −8%, configuráveis), com alerta em um clique e aviso de "alvo atingido" / "stop
  atingido".
- Na etapa 1, os ativos são **digitados** — nenhuma chave de corretora. Importar o saldo por chave
  **somente leitura** fica para a spec 002.
- Ativos são dado pessoal financeiro: só o dono vê, entram na exportação e na exclusão de conta
  (RNF08) e nunca aparecem em log.

### RF16 — Tempo real
- O painel se atualiza **sozinho, sem recarregar**. O que muda ao vivo: preço e variação das moedas; a
  distância do preço atual a cada gatilho do plano (compra, alvo, stop); valor em R$ e resultado de
  Seus ativos; saldo e curva da simulação; progresso da meta; e o disparo de alertas de preço e de sinal.
- Preços de mercado são dado público: a API mantém **uma** conexão com o stream de ticker da Binance
  para todos os pares habilitados e repassa por WebSocket (canal `market:<par>`), igual para todos os
  usuários autenticados. Eventos do usuário (sinal, operação, saldo, alerta) vão pelo canal
  `user:<userId>`, só para o dono (ADR 0001).
- No máximo **1 atualização por segundo por par** (agregação no servidor). O painel mostra a hora do
  último preço e um selo "ao vivo"; sem mensagem há mais de 10 s, vira "sem dados há N s".
- Falha de conexão: reconexão com espera crescente; ao reconectar, o painel rebusca o estado por REST
  (nada fica errado por evento perdido). Sem WebSocket disponível, consulta a cada 15 s.
- Os **preços** de compra, alvo e stop do plano não mudam a cada tick: o de compra é recalculado no
  fechamento do candle e alvo e stop ficam fixos desde a compra. O que muda ao vivo é a **distância**
  até eles, calculada no navegador a partir do preço recebido (sem ida ao servidor por tick).
- Não é tempo real: backtests, walk-forward e o ranking da meta (calculados no histórico, em cache).

## Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF01 | Backtest de 2 anos em `1h` (~17,5 mil candles) com uma estratégia em menos de 5 s |
| RNF02 | Walk-forward com até 200 combinações roda fora da thread da API e informa progresso |
| RNF03 | Alerta chega ao painel em até 10 s após o fechamento do candle |
| RNF04 | Nenhum segredo nem dado pessoal em log (e-mail, chat do Telegram); o token do bot só via env validado no boot |
| RNF05 | Em ambiente local, bind em `127.0.0.1`; publicado, só HTTPS, CORS com lista de origens e cabeçalhos de segurança |
| RNF06 | Respeitar limites da API da Binance (peso por minuto) com backoff; um único stream de mercado serve todos os usuários |
| RNF07 | Rate limit por usuário autenticado e mais duro no login |
| RNF08 | LGPD: o usuário exporta e apaga a própria conta e os próprios dados |
| RNF09 | Do preço na Binance ao painel: p95 abaixo de 2 s; um único stream de ticker serve todos os usuários |

## Critérios de aceite da spec

1. Teste de contrato prova ausência de lookahead (um candle futuro alterado não muda a decisão
   passada).
2. Backtest da estratégia de exemplo em BTC/USDT `1h` nos últimos 2 anos roda, é determinístico e
   bate, operação a operação, com a mesma estratégia rodada no modo ao vivo sobre os mesmos candles
   reproduzidos.
3. Walk-forward produz relatório fora da amostra com o alerta de overfitting funcionando.
4. Simulação ao vivo roda 72 h sem intervenção, sobrevive a um reinício e gera alertas.
5. Painel mostra as quatro telas com dados reais da simulação.
6. Contrato negativo para cada rota com recurso de usuário: o usuário B recebe `404` ao ler,
   alterar, parar ou exportar o recurso do usuário A, a listagem de B não contém o recurso de A, e a
   resposta é idêntica à de um recurso inexistente (mesmo status, código, mensagem e tamanho do corpo).
7. Dois usuários com simulações ao vivo no mesmo par recebem só os próprios alertas.

## Pendência regulatória (não bloqueia o desenvolvimento)

Oferecer sinais de compra e venda a clientes pode se enquadrar em consultoria ou análise de
investimentos (CVM) quando o produto escolhe a estratégia pelo cliente. O desenho desta spec reduz
esse risco: cada usuário configura as próprias regras, as estratégias prontas são exemplos editáveis,
e toda tela diz que é simulação. **Antes de abrir para clientes externos**, um advogado da área
precisa validar o enquadramento, os termos de uso e o texto dos avisos. Registro da decisão em
`evidence.md`.

## Gate para a spec 002

A spec 002 só começa depois que o responsável pelo produto revisar o relatório walk-forward de pelo
menos uma estratégia e a pendência regulatória acima, e registrar a decisão em `evidence.md`. O
sistema não decide isso sozinho.
