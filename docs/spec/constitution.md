# Constituição

Princípios que valem para todas as specs. Uma spec que precise violar um deles abre um ADR antes.

## 1. Simulação antes de dinheiro

Toda estratégia percorre, nesta ordem: backtest → walk-forward → simulação ao vivo → testnet →
real com valor pequeno. Pular etapa é proibido. Cada passagem para uma etapa com dinheiro real é
**decisão humana registrada**, nunca automática.

## 2. Sinal é regra, não opinião

Um sinal de compra ou venda é a saída determinística de uma regra configurada e versionada. Ele
sempre vem com: a regra que disparou, os votos de cada família, a pontuação e o histórico de acerto
daquela regra. O produto exibe, em toda tela com sinal, que se trata de simulação e não de
recomendação de investimento.

## 3. Honestidade das métricas

- Toda métrica desconta taxa e slippage.
- Toda estratégia é comparada com "comprar e segurar" no mesmo período.
- Resultado dentro da amostra nunca é apresentado sozinho: o relatório principal é o fora da amostra
  (walk-forward).
- Ambiguidade no candle (stop e alvo tocados no mesmo candle) resolve para o lado pior.

## 4. Sem lookahead

Nenhuma decisão usa dado que ainda não existia no instante da decisão. Decide-se no fechamento do
candle `t` e executa-se na abertura de `t+1`. Indicador que repinta (recalcula o passado) é proibido.

## 5. Um motor só

O cálculo de indicador, voto, risco, preenchimento e métrica vive em `packages/strategy-engine` e é
puro. Backtest, simulação ao vivo e execução real chamam o mesmo código. Divergência entre eles é
defeito, não configuração.

## 6. Dinheiro é decimal

Saldo, preço de ordem, quantidade, taxa e lucro são `numeric` no banco e decimal no código. Float
binário só no cálculo interno de indicador.

## 7. Segurança da execução real (etapa 2)

- Chave de API sem permissão de saque. O sistema verifica no boot e **recusa subir** se a chave
  puder sacar.
- Tetos por ordem, por dia e de perda são obrigatórios e não têm valor padrão "ilimitado".
- Existe sempre um botão de emergência que cancela ordens e para o robô.
- A I.A. que desenvolve o sistema não arma o modo real, não manuseia chave real e não executa ordem.

## 8. Rastreabilidade

Toda decisão é gravada: candle de referência, votos, pontuação, ordem, preenchimento, taxa e saldo
resultante. O registro é suficiente para reconstruir a operação e para o imposto.
