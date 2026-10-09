# Glossário

| Termo | Significado |
|---|---|
| **Par** | Moeda negociada contra outra: `BTC/USDT` é bitcoin cotado em dólar estável |
| **Candle** | Resumo de um intervalo: abertura, máxima, mínima, fechamento e volume |
| **Timeframe** | Duração do candle: `15m`, `1h`, `4h`, `1d` |
| **Backtest** | Rodar a estratégia sobre o histórico como se fosse ao vivo |
| **Walk-forward** | Ajustar a estratégia numa janela e testá-la na janela seguinte, nunca vista; repetir ao longo do histórico |
| **Dentro / fora da amostra** | Período usado para ajustar (dentro) e período só de teste (fora) |
| **Overfitting** | Estratégia que decorou o passado: ótima dentro da amostra, ruim fora |
| **Lookahead** | Usar, numa decisão, um dado que ainda não existia naquele instante |
| **Comprar e segurar** | Comprar no início do período e vender no fim — a régua mínima |
| **Slippage** | Diferença entre o preço esperado e o preço executado |
| **Ordem limitada** | Executa só no preço definido ou melhor |
| **Ordem a mercado** | Executa no preço disponível, qualquer que seja |
| **ATR** | Amplitude média dos candles — mede volatilidade; usado para stop e alvo |
| **ADX** | Força da tendência; separa mercado em tendência de mercado lateral (regime) |
| **RSI** | Índice de força relativa; < 30 sobrevendido, > 70 sobrecomprado |
| **MACD** | Diferença entre duas médias exponenciais e sua linha de sinal |
| **Bandas de Bollinger** | Média ± N desvios-padrão |
| **Donchian** | Máxima e mínima dos últimos N candles; rompimento indica tendência |
| **VWAP** | Preço médio ponderado pelo volume |
| **OBV** | Volume acumulado com sinal da variação do preço |
| **Funding rate** | Taxa paga entre comprados e vendidos em futuros perpétuos; mede alavancagem |
| **Fear & Greed** | Índice diário de sentimento do mercado, de 0 (medo) a 100 (ganância) |
| **Família** | Grupo de indicadores com a mesma lógica: tendência, reversão, volume, sentimento |
| **Placar** | Soma dos votos das famílias (+1, 0, −1) ponderada pelo regime |
| **Drawdown** | Queda do saldo desde o pico anterior; o pior é o drawdown máximo |
| **Sharpe / Sortino** | Retorno por unidade de risco (Sortino só conta a volatilidade negativa) |
| **Profit factor** | Soma dos ganhos ÷ soma das perdas |
| **Testnet** | Corretora de teste com API igual à real e dinheiro fictício |
| **Sombra** | Rodar a simulação em paralelo à execução real para medir a diferença |
| **Kill switch** | Comando de emergência que cancela ordens abertas e para o robô |
