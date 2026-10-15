# Telas novas — redesenho aprovado (anexo da spec 008)

Previews aprovados pelo usuário: `docs/preview/redesign/` (`index.html` e uma página por tela, capturas em
`capturas/`). O painel real segue o preview; o preview vale como especificação visual. O gráfico novo tem spec própria
(`specs/009-grafico-estilo-binance/`, preview em `docs/preview/grafico-binance/`).

## Decisões aprovadas

| # | Decisão | Valor |
|---|---|---|
| 1 | Rótulo do veredito do ranking | Favorável / Neutro / Desfavorável "no histórico" (o valor da API não muda) |
| 2 | Lista de backtests | Agrupada por estratégia, grupos recolhíveis com resumo |
| 3 | Simulação ao vivo | Cartão no topo de Backtests |
| 4 | Linha de pulso | Em toda tela com simulação (Visão geral, detalhe, meta) |
| 5 | "Abaixo do ritmo" | Mantido, ritmo linear, com legenda |

## Telas

| Tela | Preview | O que muda |
|---|---|---|
| Visão geral | `visao-geral.html` | Linha de pulso; "Última decisão…" com link no cartão de saldo; meta com número e unidade; zero em cinza com "=" |
| Detalhe da simulação ao vivo | `simulacao-ao-vivo.html` | Cartão "Acompanhamento" (saldo, resultado, comprar e segurar, meta); estado vazio que ensina; "O que falta para comprar agora"; tabela "O que a estratégia decidiu a cada hora" com horas iguais agrupadas e "ver votos"; "Esperou" neutro no lugar de VENDA sem posição |
| Meta e ranking | `meta-e-ranking.html` | Barras com número, unidade e legenda ("0,00 de 300,00 USDT", "16 h de 7 dias"); ranking com pódio de 3 e tabela de 10; veredito novo |
| Lista de backtests | `backtests-lista.html` | Grupos por estratégia; caixa de seleção em coluna própria de 44 px; resultado com barra a partir do zero, seta e sinal |

## Regras comuns

- Estado é sempre ícone + palavra + cor; zero é neutro; verde e vermelho só para ganho e perda reais.
- Sempre a referência "comprar e segurar" ao lado do resultado.
- Alvos de toque de 44 px, foco visível, claro e escuro, sem rolagem horizontal a 375 px.
- Sem estilo inline (os previews usam `style` só para largura de barra; no painel vai para classe/CSS Modules).
- Dados de exemplo nos previews (ranking, indicadores de "o que falta", estado "com operações") são ilustrativos.

## Pendências conhecidas do redesenho

- Agrupar backtests de verdade pede a lista completa ou uma rota agrupada na API (o preview agrupa o que está carregado).
- O painel mostra "Você já exportou há pouco" para qualquer 429 do botão de exportação, inclusive o limite geral.
- Pontinhos de "esperou" e níveis de stop/alvo no gráfico (T3.4) passaram para a spec 009.
