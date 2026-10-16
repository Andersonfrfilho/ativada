# Comparação: previews aprovados × telas reais (app dev)

Data: 2026-10-15. Previews: `docs/preview/redesign/*` e `docs/preview/grafico-binance/*`. Real: painel dev em 127.0.0.1:56100,
capturas a 1280 px (claro) e 375 px (escuro). Sala da equipe (outro agente) ignorada. O app tem dados vivos (a Visão geral
mostra a simulação ETH 15m, não a LINK 1h do preview), então números diferem por natureza; o que conta é estrutura e tom.

## Nota de fidelidade (0 a 10)

| Tela | Nota | Razão |
|---|---|---|
| Visão geral | 4 | Mesmos dados, mas sem hierarquia: sem cartão-herói, sem duas colunas, sem gráfico "Saldo hora a hora", sem "Últimas decisões", links como texto sublinhado. |
| Simulação ao vivo (detalhe) | 6 | Blocos 1 a 5 existem e o texto bate quase palavra por palavra; falha na grade (coluna única estreita), no estado vazio, nos números dos cartões e no gráfico. |
| Gráfico estilo Binance | 5 | Velas, previsão, camadas e "Próxima vela de perto" existem; mas o gráfico ocupa ~620 px com a maior parte vazia e canal, volume e placar saem espremidos. |
| Backtests (lista) | 7 | Agrupamento, barras, filtros, ordenação e walk-forward batem; falta o cabeçalho de seção do preview e o formulário está sem grade. |
| Metas (lista) | 3 | O preview não cobre a lista, mas está seca: botão "Apagar" gigante em cada linha, 10 metas iguais, sem estado de simulação. |
| Meta e ranking (detalhe) | 3 | Preview: 3 cartões de pódio + tabela de 10 linhas + "Mostrar as 45". Real: 50+ cartões empilhados (13.000 px) e sem o bloco "Simulação desta meta". |

## Divergências priorizadas (impacto para quem reclamou de "sem sinal de vida e sem números")

| # | Tela | Divergência | Preview | Real | Impacto |
|---|---|---|---|---|---|
| 1 | Visão geral | Falta o cartão-herói numérico: saldo grande, selo "Rodando há 16 h", chip "0,00 USDT (0,00%) desde o início" e frase de contexto | `BalanceCard` grande, 2 colunas | "Saldo da simulação" + "Rodando" em texto; saldo pequeno, sem chip | Alto |
| 2 | Visão geral | Sem gráfico "Saldo hora a hora" legível | Linha azul + tracejada com eixos 10.000/9.800, horas e legenda | Duas linhas sem eixo, sem rótulo, sem legenda; barras do `ComparisonBars` sem a escala legível | Alto |
| 3 | Visão geral | Faltam "Últimas decisões" (5 linhas com hora, "Esperou", preço, pontuação) e a legenda azul "2,01 pontos acima..." | Cartão 2 | "Últimos sinais: Ainda não houve sinais" (só mostra compra/venda e esconde "esperou") | Alto: some o sinal de vida |
| 4 | Visão geral | Grade: preview tem 2 colunas (simulação + meta/sentimento) e preços em grade; real é coluna única de ~900 px com borda vazia à esquerda e o cabeçalho quebrado em 2 linhas | `max-width` ~1125 px | Coluna única estreita; nav + tema + Sair em 2 linhas | Alto |
| 5 | Gráfico | Com poucas velas deixa ~75% do canvas vazio à esquerda (sem ajuste de zoom); painel "Próxima vela de perto" ocupa a metade; canal, volume e placar ilegíveis; tabela de compras corta colunas à direita | Gráfico largo, 349 velas | 15m: ~30 velas coladas à direita | Alto (é a tela que vende) |
| 6 | Meta (detalhe) | Pódio de 3, tabela compacta com barra tricolor e "Mostrar as 45" viraram 50+ cartões longos (13.000 px); faltam "Simulação desta meta" (Faltam/Prazo/Queda que ainda cabe) e "Situação das moedas agora" | Ranking de 10 linhas | Lista completa por padrão | Alto |
| 7 | Simulação | Régua "O que falta": no preview a zona-alvo é hachurada; no real a faixa verde vai preenchida até o limiar e parece "quase lá" | Zona hachurada à direita | Faixa cheia | Médio |
| 8 | Simulação | Cartões do Acompanhamento e totais: saldo pequeno; totais viram tabela de 6 colunas com "0,00" repetido; 3 avisos "i" repetidos; frase solta "Nenhuma operação fechada ainda. + uma operação..." | 3 cartões com mono grande, caixa tracejada | Texto solto e avisos empilhados | Médio |
| 9 | Simulação | Tela com ~7.200 px (preview ~2.350): sala, previsão, histórico de acertos (20 linhas) e "Falas em texto" empurram "O que a estratégia decidiu" para o fim | 5 blocos em sequência | Decisões depois de tudo | Médio |
| 10 | Metas (lista) | Botão "Apagar meta de BTC/USDT" de 230 px em cada linha; nada diz se a meta tem simulação rodando | n/a | 10 linhas quase iguais | Médio |
| 11 | Todas | Cabeçalho: preview tem ícone de usuário, selo "Preços ao vivo" e "automático" na mesma linha; real usa 2 linhas com "Sair" grande | 1 linha | 2 linhas | Médio |
| 12 | Mobile 375 (escuro) | Em uma captura a Visão geral abriu com dois erros "Não foi possível carregar suas simulações/meta" (provável limite de renovação por minuto do meu script; a leitura seguinte carregou tudo); sem overflow horizontal | Cartões empilhados | Preços em 2 colunas ok | Baixo (checar 429) |

## O que bate

Textos do pulso ("Última decisão", "Próxima às", "Painel atualizado"), "Faltam 2,5 pontos", frase "Abaixo do ritmo", barras de meta,
tabela REGRA/AGORA/PRECISA/DISTÂNCIA, camadas do gráfico, "Tendência, não promessa", agrupamento da lista de backtests com
mediana/melhor/pior, rótulos Favorável/Neutro/Desfavorável, sem overflow horizontal a 375 px, tema escuro legível.

## O real tem a mais / falta do preview

A mais: Sala da equipe (ignorada), "Falas desta vela em texto", histórico de acertos completo, "Comparar prazos desta moeda",
seletor de vela com explicações, contador "5 de 5 simulações". Faltam: "Por que está assim" (recolhível de decisões de design),
cartão-herói, "Últimas decisões" na Visão geral, "Situação das moedas agora", "Simulação desta meta".

## Plano de correção (tasks pequenas)

| Task | O que fazer | Arquivos prováveis (`apps/frontend-ativada/src/`) | Modelo |
|---|---|---|---|
| C1 | Grade: `max-width` ~1200 px, 2 colunas na Visão geral e no detalhe; cabeçalho numa linha | `layout/AppShell*`, `styles/global.css` | sonnet |
| C2 | `BalanceCard`: saldo grande, selo "Rodando há N h", chip de resultado, frase de contexto, legenda azul | `overview/BalanceCard*` | sonnet |
| C3 | Gráfico "Saldo hora a hora" com eixos, rótulos e legenda | `overview/` (novo componente) | sonnet |
| C4 | "Últimas decisões" na Visão geral com `decisions` do `live-status` (inclui "esperou") no lugar de "Últimos sinais" | `overview/`, `runs/live-tracking/decision-text.ts` | haiku |
| C5 | Gráfico: `fitContent` com poucas velas, largura total, painel "Próxima vela" abaixo em < 1100 px, tabela sem corte | `runs/candle-chart/*` | sonnet |
| C6 | Meta (detalhe): pódio de 3 + tabela de 10 + "Mostrar todas"; bloco "Simulação desta meta" | `goals/*` | sonnet |
| C7 | Lista de Metas: "Apagar" como ícone com confirmação, selo da simulação | `goals/GoalsPage*` | haiku |
| C8 | Simulação: decisões antes de sala e acertos, unificar os avisos "i", corrigir a frase de operação aberta | `runs/live-tracking/*`, `backtests/BacktestDetailPage.page.tsx` | haiku |
| C9 | Régua do placar com hachura na zona-alvo, sem preencher até o limiar | `runs/live-tracking/NextTriggersBlock*` | haiku |
| C10 | Checar 429 na renovação (mobile) e nav a 375 px; recapturar as 6 telas e comparar com os previews | `session/*`, `layout/*` | sonnet |

Gates por task: `tsc --noEmit`, `bun run --cwd apps/frontend-ativada test`, `make check`, commit isolado. Screenshot lado a lado só ao fim.

## Depois das correções (2026-10-15, painel dev 127.0.0.1:56100)

Capturas lado a lado (preview | real) em `capturas/fidelidade-*.png`; o que bate e o que ainda falta, por tela.

| Tela | Antes | Depois | O que mudou / o que ainda falta |
|---|---|---|---|
| Visão geral | 4 | 8 | Cartão-herói (saldo grande, "Rodando há N h", chip "= 0,00 USDT (0,00%) desde o início", frase de contexto, legenda azul de pontos acima/abaixo de comprar e segurar), gráfico "Saldo a cada 15 min" com maior e menor valor, começo e "agora" e legenda, "Últimas decisões" com os "Esperou", duas colunas e "Preços agora" em cartão. Falta: coluna de preços com "na simulação" destacado e o recolhível "Por que está assim". |
| Cabeçalho (todas) | 3 | 8 | Uma linha a 1280 px (61 px de altura contra 114), página de 1200 px; abaixo de 1100 px vira o botão Menu (fecha ao navegar). Falta o ícone de usuário no lugar do "Sair". |
| Gráfico de velas | 5 | 7 | Com 23 velas a janela agora enche o canvas (antes ~75% vazio), painel "Próxima vela de perto" de 250 a 310 px (era 340), canvas de 560 px (canal, volume e placar legíveis), tabela de operações sem corte lateral. Falta: a cor do rótulo "Placar" do canal e o cone mais largo do preview. |
| Meta (detalhe) | 3 | 7 | Pódio de 3 cartões, linhas compactas com barra e % alcançou/parou, "Mostrar as N" (13.000 px viraram ~3.600 px), "Simulação desta meta" (Faltam, Prazo, Queda que ainda cabe) e "Situação das moedas agora" com preço e selo. Falta: tabela com cabeçalho de colunas fixo e o filtro em abas ("Todos os 9 pares | Só LINK/USDT"). |
| Simulação ao vivo | 6 | 7 | Decisões antes de sala e histórico e só as 8 mais novas ("Ver mais N decisões"), um aviso só no lugar de três, régua do placar com zona hachurada, totais em cartões. Falta: o resumo de totais da caixa tracejada do preview e encurtar o histórico de acertos (20 linhas). |
| Metas (lista) | 3 | 6 | "Apagar" virou ícone com dica (segundo clique confirma) e a meta com simulação rodando ganha o selo. Falta: mostrar o resultado atual da simulação na linha. |
| Backtests (lista) | 7 | 7 | Só ganhou o cabeçalho de uma linha; o cabeçalho de seção e a grade do formulário seguem pendentes. |

**C10 (erro "Não foi possível carregar" na Visão geral).** Com sessão válida, 25 s na Visão geral não geraram 429 nem erro. Três consultas (simulação ativa, meta ativa e lista de metas) pediam o mesmo `GET /v1/runs?kind=live_paper&limit=100` com chaves diferentes (2 pedidos por carga na Visão geral); agora dividem UMA chave (`['runs','live-page']`) e cada tela escolhe a sua simulação por `select`. O erro real continua aparecendo (`role="alert"`). A causa mais provável dos dois erros da captura antiga é o limite de 10 renovações de sessão por minuto, estourado pelos logins repetidos do meu script de captura, e não o painel.
