# Spec 011 — Adendo: o escritório de investimento (equipe na varanda, lousa, crachás, proteções, ranking)

> Adendo da spec 011 (não a substitui). Vale tudo de `spec.md` §4 (honestidade, movimento só em tokens, leve, estado =
> ícone + palavra + cor) e as decisões D1–D8 já respondidas em `evidence.md`. Preview navegável:
> `docs/preview/escritorio/index.html` (cenas por `#cena=…`; a primeira é `#cena=grafico-equipe`), capturas em
> `docs/preview/escritorio/capturas/`.

## 1. Pedidos (2026-10-16, Anderson, verbatim)

1. "add os crachás, melhore o design da sala, add mesas, computadores, faça eles se mexerem no ambiente como se fosse um
   escritório de investimento"
2. "monte um preview da equipe perto dos gráficos dando opiniões"
3. "esse ficou bom, mas precisamos rolar a tela para verificar os agents, precisamos deles ficarem em tela"
4. "algo como eles ali em cima do gráfico, olhando para baixo, movimentando e dando suas opiniões em balões, alguns em uma
   lousa"
5. "o agente que tiver modelos com uma marcação diferente"
6. "e as proteções: dizer proteções contra queda, sugestão de venda aqui caso abaixe muito"
7. "acho que pode melhorar as plaquinhas de compra e venda com a porcentagem de ganho"
8. "e o tempo que eles estão levando em consideração, com um ranking entre os personagens de quem deu as melhores dicas"
9. "e acho que poderia também montar algo como vendas em partes, então aqui ganha 3%, 5%, 10% e aqui compra em 2%, 3%, 5% em
   cascata, entendeu? e a quantidade de compra e venda"
10. "cada agente com suas opiniões: se tiver termos, precisa ter tooltip explicando o que é aquilo"
11. "utilize uma skill de design"

## 2. Objetivo

Duas vistas com o MESMO conteúdo e as MESMAS frases do servidor:

1. **Gráfico + equipe na varanda** (a vista do dia a dia, `#cena=grafico-equipe`): uma faixa horizontal **acima** do
   gráfico com a equipe em pé numa varanda de vidro, de frente, inclinada para baixo, olhando o pregão. Cada agente tem o
   crachá no parapeito e um balão curto com a cauda para baixo; uma linha tracejada liga o balão ao ponto do gráfico que ele
   comenta. À direita, a **lousa** com o que é longo: proteções, ranking, notas do auditor (e a escada, na cena futura).
   Abaixo, o gráfico com a largura toda e o resto da altura útil. Equipe e gráfico **sempre em tela, sem rolar**.
2. **Escritório** (o cartão "Sala da equipe" redesenhado; na vista principal fica recolhido em "Ver o escritório"): mesas
   com monitores, telão, quadro de avisos, relógio, mesa da Alice, mesa do Otávio, café e a sala dos modelos. Na vela nova,
   quem tem opinião leva a opinião até a Alice e volta.

## 3. Equipe, crachás e tipos de agente

| Agente | Tipo | Cargo | ID · versão | Selo do auditor | O que faz |
|---|---|---|---|---|---|
| Tiago | ● Regra | Especialista em Tendência | `trend` · Tendência v1 | ↘ Abaixo da moeda ao ar (47,44%, 5.181 de 10.921) | médias (EMA 9 e 21), MACD, máxima de 20 velas |
| Renata | ● Regra | Especialista em Reversão | `reversion` · Reversão v1 | ✓ Acima da moeda ao ar (55,64%, 1.420 de 2.552), peso 0,03 | RSI 14 e bandas de Bollinger 20 |
| Vitor | ● Regra | Especialista em Volume | `volume` · Volume v1 | ↘ Abaixo da moeda ao ar (48,27%, 8.025 de 16.625) | OBV contra a EMA 20 dele |
| Sofia | ● Regra | Especialista em Sentimento | `sentiment` · Sentimento v1 | = Igual à moeda ao ar (49,95%, 2.569 de 5.143) | Medo e Ganância (Fear & Greed) 25/75 |
| Alice | ● Regra | Analista de Risco sênior | `risk` · Risco v1 (`analyst-1`) | ◐ Decide · não prevê | pausa, tamanho e saída; respeita as cinco travas |
| Otávio | ● Regra | Auditor | `auditor` · Auditor v1 (Wilson 95%) | 🔍 Mede · não vota | mede todos contra cara ou coroa (50%) |
| Nina | ◆ Modelo | Analista de Notícias | — | ◷ Em observação · em breve | agente de modelo; ainda não existe |
| Lucas | ◆ Modelo | Analista Estatístico | — | ◷ Em observação · em breve | agente de modelo; ainda não existe |
| Clara | ◆ Modelo | Repórter | — | ◷ Em observação · em breve | agente de modelo; ainda não existe |

- **E-RF01 — Crachá compacto sempre visível.** Na varanda: ● ou ◆, nome, selo curto (ícone + palavra + cor: "✓ Acima",
  "↘ Abaixo", "= Igual", "◐ Decide", "🔍 Mede") e cargo curto ("Reversão"). No escritório: retrato, nome, cargo inteiro,
  selo e `ID · versão`. O nome acessível do botão traz tudo por extenso ("Renata, Especialista em Reversão, regra, Acima da
  moeda ao ar. Ver a ficha").
- **E-RF02 — Ficha (popover).** Clique, Enter ou toque no crachá: tipo (● Regra / ◆ Modelo), o que faz, acerto "N de M" +
  peso ou "não vota", horizonte (E-RF15), o que disse na vela (frase inteira do catálogo, com o gatilho), ID · versão. Esc
  ou clique fora fecha; o foco volta ao crachá. A ficha do Otávio explica a moeda ao ar e o intervalo de Wilson.
- **E-RF03 — Selo vem do servidor.** `verdict` da A7 (`above | even | below | too_few`) com o vocabulário da 009 (Acima,
  Igual à, Abaixo da moeda ao ar, Em observação).
- **E-RF04 — Agentes de modelo com marcação própria (pedido 5).** Nunca só cor:
  - **forma**: crachá com cantos assimétricos e moldura tracejada, ícone de chip dentro de um losango, a palavra "MODELO";
  - **cor**: `--model` (púrpura) só para eles;
  - **lugar**: coluna "◆ MODELOS · em breve" na ponta esquerda da varanda e, no escritório, a sala de vidro;
  - **legenda fixa da faixa**: "● Regra ◆ Modelo".

  A ficha do modelo traz: modelo e versão ("Claude Haiku 4.5 (proposto)"), onde roda (nuvem), custo estimado por dia
  (centavos; 96 chamadas, uma por vela), última chamada, taxa de falha, e o auditor "em observação: 0 de 30 (faltam 30)",
  com acerto medido separado. Quando falarem, o balão terá o rodapé "gerado por modelo: <nome e versão> · pode errar" (a
  ficha mostra um exemplo marcado como exemplo). Hoje nunca falam nem votam.

## 4. Vista principal: equipe na varanda + gráfico

- **E-RF05 — Equipe sempre em tela (pedido 3).** A faixa da varanda (170–220 px; medido 219 px) e o gráfico cabem na
  janela sem rolar a página; o gráfico pega o resto da altura útil (240 a 640 px, recalculado no redimensionamento). O
  cabeçalho do painel fica compacto nesta vista (título, seletor e ícones de animação em uma linha). Ficha do sinal,
  plaquinhas, ranking completo e "Ver o escritório" vêm depois do primeiro quadro.
- **E-RF06 — Varanda.** Seis agentes em pé atrás do parapeito de vidro, inclinados para o gráfico (os da esquerda para a
  direita e vice-versa), olhos para baixo e braço apontando. A Alice fica no centro (é ela quem decide) e o Otávio na
  ponta, ao lado da lousa.
- **E-RF07 — Balões curtos com a cauda para baixo.** Voto (chip), uma linha curta com o número que o agente olha
  ("RSI 34,6 · banda 12,862", "EMA 9 abaixo da 21", "OBV abaixo da média", "Medo e Ganância 41", "teto de risco ¼",
  "Reversão 55,6% > moeda") e o horizonte. A frase longa vai para a ficha e para a lousa. Balão tracejado = não vota;
  borda de 2 px `--accent` = votou.
- **E-RF08 — Linhas de ligação.** Do bico do balão até o ponto comentado, com seta:
  - Renata → banda inferior;
  - Tiago → EMA 9;
  - Vitor → barra de volume;
  - Alice → o ponto "sugestão de venda aqui" na proteção contra queda.

  Sofia (índice diário) e Otávio (lousa) não têm linha. As linhas são tracejadas e finas; a do agente sob o mouse ou foco
  fica cheia. Abaixo de 700 px não há linhas.
- **E-RF09 — Lousa.** Quadro branco à direita da varanda, com abas (Proteções · Ranking · Notas, e Escada na cena futura).
  - **Proteções**: proteção contra queda (preço, % líquido, USDT e a barra "faltam 0,85% até a proteção"), alvo de ganho
    (preço, % líquido, USDT), proteção por tempo ("sai na 5ª vela, às 04:15"), lucro mínimo e os post-its da Alice (trava
    de pausa "0 de 5", "Perdas seguidas: 1 de 3"). O post-it da trava ativa fica em `--warn` com cadeado fechado.
  - **Ranking**: o resumo (E-RF17) com um link para o ranking completo.
  - **Notas**: o Otávio risca quem não vota ("~~Tendência 47,44%~~ … não votam"), mais o ganho ÷ risco e o gatilho
    ("Renata compra se fechar abaixo de 12,862").
- **E-RF10 — Vela apontada.** Mouse ou teclado (←/→, Home/End, Esc) trocam os balões, a ficha e as linhas para a vela
  apontada. O anúncio `aria-live` sai 400 ms depois da última tecla.
- **E-RF11 — Celular (< 700 px).** A varanda vira barra fixa no topo do gráfico (`position: sticky`):
  - seis avatares com nome e selo, mais o losango "◆ 3 em breve";
  - **um balão ativo por vez** (toque no avatar ou deslize para o lado);
  - a lousa vira **folha** que sobe do rodapé ("Lousa da equipe: proteções e ranking").

## 5. Proteções, plaquinhas e escada

- **E-RF12 — Proteção contra queda (pedido 6).** O stop chama-se sempre "proteção contra queda" (glossário: = stop).
  - **No gráfico**: linha tracejada `--sell` e etiqueta grande com escudo: "PROTEÇÃO CONTRA QUEDA · 12,789 · sugestão de
    venda aqui" e "Se cair a 12,789, vende aqui (−0,63%) para limitar a perda". O ponto "sugestão de venda aqui" fica na
    vela em formação e a linha da Alice chega nele.
  - **Na ficha do sinal e no aviso**: "Sugestão de venda (proteção contra queda): se o preço cair a 12,789. É a regra da
    simulação, não uma ordem." e o botão "Copiar 12.789" (ponto decimal, o formato da corretora; "✓ Copiado").
  - **Comprado**: distância até a proteção com barra (ícone + palavra + cor): verde "longe" acima de 50% da folga, âmbar
    "perto" entre 20% e 50%, vermelho "muito perto" abaixo de 20%.
- **E-RF13 — Plaquinhas com a porcentagem (pedido 7).** A % fica em tipografia grande, o USDT pequeno, sempre já líquida de
  custo (taxa + deslizamento), com seta e cor e "=" cinza no zero. Arredondamento honesto: ganho para baixo, perda para
  cima.
  - Compra: "▲ COMPRA 12,870 · **+0,76%** líquido no alvo 13,007 (bruto +1,06%) · +8,5 USDT · proteção −0,93% (−10,5
    USDT) · ganho ÷ risco 0,8".
  - Venda por alvo: "▼ VENDA 13,013 · **+0,76%** líquido (bruto +1,06%) · +8,5 USDT".
  - Saída pela proteção: "▼ SAÍDA PELA PROTEÇÃO 12,372 · **−0,99%** líquido (bruto −0,69%) · −10,8 USDT".
  - Operação aberta: "▲ COMPRADO desde 03:00 · **−0,08%** líquido se vender agora (bruto +0,22%) · −0,9 USDT".

  O mesmo vale para a placa da Renata no escritório, a ficha do sinal e o rótulo no gráfico ("▼ Venda 13,013 · alvo ·
  +0,76% líquido").
- **E-RF14 — Escada (cena futura, spec 016; pedido 9).** `#cena=escada` desenha os degraus. Cada degrau mostra a
  quantidade (LINK, USDT, % da posição) e o estado (executada, pendente, cancelada).
  - **Compras em cascata abaixo do preço**: "Compra 1/3 a 12,870 · executada", "2/3 se cair −2% (12,613) · 29,2 LINK ·
    368,3 USDT · 33% · pendente", "3/3 se cair −3% (12,484)".
  - **Vendas parciais acima**, com o % líquido: "Vende 1/3 a +3% (13,257) · líquido +2,70%"; os de +5% e +10% são
    indicados "fora da tela".
  - **Lousa, aba Escada**: os degraus, o preço médio se as três entrarem (12,656) e a exposição máxima.
  - **Ficha do sinal**: "3 compras · 3 vendas · exposição máxima 1.108,6 USDT · perda máxima 29,3 USDT. Comprar em queda
    aumenta o risco. Simulação com dinheiro fictício." A exposição total nunca passa do orçamento de risco.

  Tudo marcado "Cena futura (spec 016)" até o motor ter a escada.

## 6. Horizonte, ranking e termos

- **E-RF15 — Horizonte da opinião (pedido 8).** Cada balão diz até quando a opinião vale ("vale até 03:45", o fechamento da
  vela em formação). O Otávio diz a janela de acerto ("janela de 30 dias"). A ficha completa: "olha a vela de 15 min · a
  opinião vale até 03:45 · janela de acerto: últimos 30 dias · histórico medido em 183 dias". No gráfico, a coluna da vela
  em formação é sombreada com "opiniões valem até 03:45".
- **E-RF16 — Ranking completo.** Seção recolhível abaixo do primeiro quadro.
  - **Colunas**: posição, agente (● e cargo), acerto do lado "N de M", intervalo de 95% (Wilson) contra a linha de 50%,
    veredito, peso, tendência da semana, melhor dica e pior dica.
  - **Dicas**: botões que apontam o gráfico para aquela vela; o preview calcula sobre as velas reais na tela.
  - **Ordem**: pelo **limite inferior de Wilson**, nunca pelo acerto bruto. A **coroa** vai só para quem está acima da
    moeda ao ar (hoje só a Renata).
  - **Seletores**: janela (30 dias / 6 meses / desde o início) e vela (15 min / 1 hora). Janela sem medição: "Ainda não
    medido nesta janela…", sem número inventado.
  - **Fora da classificação**: quem tem menos de 30 previsões fica "em observação", com "faltam N previsões". Os modelos
    ficam numa lista própria ◆. Alice e Otávio não entram (não preveem a vela).
  - **Rodapé**: "Ranking é desempenho passado, não garantia." A coluna "Semana" fica "—" até o servidor guardar por semana.
- **E-RF17 — Ranking curto na lousa.** Os quatro especialistas na ordem de Wilson, com coroa só no primeiro se ele estiver
  acima da moeda, "53,7% no pior caso" e o selo; mais a linha "◆ Nina, Lucas, Clara: em observação (faltam 30)".
- **E-RF18 — Todo termo tem dica (pedido 10).** Todo termo técnico em balão, lousa, plaquinha, ficha do sinal, ranking e
  ficha de agente usa o mesmo formato.
  - **Visual**: sublinhado pontilhado discreto + "?" pequeno.
  - **Abre**: com mouse, foco por teclado ou toque.
  - **Conteúdo**: uma ou duas frases leigas + um exemplo com os números da tela.
  - **Comportamento**: `role="tooltip"` com `aria-describedby`; Esc fecha; não some ao levar o mouse até a dica; abre
    acima do termo para não cobrir o gráfico (abaixo, quando o termo está abaixo do gráfico); alvo de toque de 44 px no
    celular; sem animação. A dica nunca promete resultado.

  O painel reaproveita o `Term` e o glossário fechado (`apps/frontend-ativada/src/glossary/`), que ganha o campo "exemplo".
  No escritório (palco `aria-hidden`), os termos ficam na lista de crachás e falas.

### Glossário (texto final; vira o glossário do painel)

| Termo | Dica | Exemplo (números da tela) |
|---|---|---|
| RSI | Mede, de 0 a 100, se o preço subiu ou caiu rápido demais. Abaixo de 30 costuma ser lido como "barato"; acima de 70, como "caro". | Agora: RSI 34,6, nem um nem outro. |
| Banda de Bollinger | Faixa em volta da média das últimas 20 velas. Fechar abaixo da banda de baixo é um exagero que às vezes volta. | Banda de baixo agora: 12,862. |
| EMA (média) | Média do preço que dá mais peso às velas recentes. A EMA 9 é a rápida; a EMA 21, a lenta. A rápida acima da lenta indica preço subindo. | Agora: EMA 9 12,928 e EMA 21 12,948. |
| MACD | Diferença entre duas médias do preço comparada com uma linha de sinal. Acima da linha indica força para cima. | — |
| Donchian | A máxima e a mínima das últimas 20 velas. Fechar acima da máxima indica rompimento. | — |
| OBV (volume) | Soma o volume das velas que subiram e desconta o das que caíram. Acima da média dele, o volume confirma a subida. | — |
| Medo e Ganância | Índice diário, de 0 a 100, do humor do mercado de cripto (Fear & Greed). Até 25 é medo; a partir de 75, ganância. | Hoje: 41, nem medo nem ganância. |
| Faixa (ATR) | O tamanho típico do movimento de uma vela, medido nas últimas 14. | — |
| Placar | A soma dos votos das regras da estratégia. A estratégia compra quando o placar alcança o limiar. | — |
| Limiar | O número que o placar precisa alcançar para a estratégia agir. | — |
| Proteção contra queda (= stop) | O preço em que a simulação vende para limitar a perda. É uma regra da simulação, não uma ordem para você. | Se cair a 12,789, vende: −0,93% líquido (−10,5 USDT). |
| Alvo de ganho | O preço em que a simulação vende para realizar o lucro. | 13,007: +0,76% líquido (+8,5 USDT). |
| Entrada | O preço em que a simulação comprou. | 12,870, às 03:00. |
| Ganho ÷ risco | Quanto se ganha no alvo para cada 1 que se perde na proteção, já com custos. Abaixo de 1, o ganho possível é menor que a perda possível. | 0,76% ÷ 0,93% = 0,8. |
| Líquido | O resultado depois da taxa e do deslizamento na compra e na venda. | Custo de ida e volta 0,30%: +1,06% bruto vira +0,76% líquido. |
| Intervalo de confiança (Wilson) | A faixa onde o acerto verdadeiro provavelmente está, dado quantas previsões foram contadas. Com poucas previsões a faixa fica larga; o ranking usa o pior caso dela. | Reversão: de 53,7% a 57,6%, em 2.552 previsões. |
| Moeda ao ar | Acertar 50%, como cara ou coroa. Só ganha voto quem fica acima disso mesmo no pior caso do intervalo. | Tendência: 46,5% a 48,4%, abaixo da moeda. |
| Em observação | Menos de 30 previsões contadas: ainda não dá para medir o acerto, então não vota. | Nina, Lucas e Clara: faltam 30. |
| Trava | Um limite de segurança (perda do dia, perdas seguidas, operações demais, folga da meta, movimento que não paga as taxas). Com uma trava ligada, a simulação não abre compra nova. | Agora: 0 de 5 ligadas. |
| Teto de risco | Quanto do risco normal da estratégia a Alice libera. | ¼ = 0,25% do saldo por operação, em vez de 1%. |
| Postura da Alice (PAUSA, CAUTELA, MODERADA, LIBERADA) | PAUSA: nenhuma compra nova. CAUTELA: ¼ do risco. MODERADA: ½. LIBERADA: o risco inteiro da estratégia. | — |
| Lucro mínimo | Só compra se o alvo pagar pelo menos o dobro do custo de ida e volta. | 1,06% ≥ 2 × 0,30% = 0,60%. |
| Deslizamento | A diferença entre o preço pedido e o preço em que a ordem sai. | — |
| Taxa | O que a corretora cobra em cada compra e em cada venda. | — |
| Proteção por tempo | A Alice fecha a operação depois de um número de velas, mesmo sem alvo nem proteção. | Sai na 5ª vela, às 04:15. |
| Escada | Comprar ou vender em partes, em preços diferentes, em vez de tudo de uma vez. Comprar em queda aumenta o risco. | — |
| Preço médio | O preço médio pago por todas as partes compradas. | 12,656 se as 3 compras entrarem. |
| Vela em formação | A vela de agora, que ainda não fechou. As opiniões valem até ela fechar. | Esta fecha às 03:45. |
| Peso | Quanto o voto conta para a Alice. Quem não provou valor tem peso 0. | Reversão: 0,03. |
| Agente de regra | Segue uma conta fixa sobre o preço: a mesma vela dá sempre a mesma opinião. | — |
| Agente de modelo | Usa um modelo de linguagem (IA) em vez de uma conta fixa. Pode errar, e o auditor mede o acerto dele à parte. | — |

## 7. Escritório (recolhido em "Ver o escritório" na vista principal)

- **E-RF19 — Planta frontal.**
  - **Palco**: 1200 × 760 unidades com mesas e monitores. Monitores: Tiago com EMA, Renata com RSI e Bollinger, Vitor com
    volume e OBV, Sofia com o medidor do Medo e Ganância.
  - **Parede**: telão com o gráfico da simulação, relógio com o próximo fechamento e quadro de avisos com o sinal e cinco
    cadeados.
  - **Mesas da frente**: mesa da Alice e mesa do Otávio com a prancheta de Wilson.
  - **Resto do piso**: café e a sala de vidro dos modelos, com ◆.
  - **Luz por estado**: calmo, vela fechando, compra, pausa em âmbar.
  - **Telão grande**: o seletor "Escritório | Sala com o gráfico" aumenta o telão e liga os chips de cada agente às
    linhas do telão.
- **E-RF20 — Lista equivalente.** O palco é `aria-hidden` e sem focável; abaixo dele ficam a lista de crachás (botões de 44 px
  com a ficha) e "Falas desta vela em texto". Abaixo de 900 px de largura útil o palco dá lugar ao telão compacto e à lista.

## 8. Movimento com propósito (≤ 2,5 s por sequência; Web Animations, pausável)

| Sequência | O quê | Fim medido |
|---|---|---|
| Varanda, vela nova | a vela em formação cresce e a anterior "fecha"; todos se inclinam; a Alice entra pelo lado e vai ao centro enquanto Renata e Vitor abrem espaço; cada balão sai dos "•••" um a um (120 ms) e a linha aparece; o braço aponta; o Otávio escreve na lousa (linhas reveladas a cada 140 ms), risca quem não vota e a Alice cola o post-it | 2.100 ms, 33 elementos animados |
| Escritório, vela nova | olham o monitor, levantam, levam a ficha do voto até a mesa da Alice e voltam; a Alice decide e o Otávio confere | 2.460 ms, 28 elementos |
| Escritório, sinal de compra | a mesma reunião; a Renata levanta a placa "▲ COMPRA" e o telão pisca entrada, alvo e proteção | 2.460 ms, 32 elementos |

- Nada em laço: os movimentos de ocioso acontecem uma vez cada e param em ≈ 6,3 s.
- Controles "Repetir", "Pausar/Continuar" e "Animação: ligada/desligada".
- `prefers-reduced-motion` ou animação desligada: estado final no primeiro quadro. Pausa automática fora da tela
  (`IntersectionObserver`) e com a aba oculta.
- Abrir a tela não anima: a página fica completa em repouso.
- Durações em tokens: `--motion-fast`, `--motion-medium` e `--motion-walk` (1750 ms, novo).

## 9. Medidas (Playwright + Edge, preview, tema claro e escuro)

`scrollY` = 0 e nenhuma rolagem horizontal em todas as linhas abaixo. Os crachás, balões e a lousa aparecem inteiros
(`getBoundingClientRect` dentro da janela), sem sobreposição entre balões e crachás.

| Janela | Crachás visíveis | Balões visíveis | Lousa | Varanda | Gráfico (topo → base) | Gráfico na altura útil |
|---|---|---|---|---|---|---|
| 1280 × 720 | 9 de 9 | 6 de 6 | inteira | 219 px | 427 → 700 (273 px) | 55% |
| 1440 × 800 | 9 de 9 | 6 de 6 | inteira | 219 px | 427 → 780 (353 px) | 62% |
| 1920 × 1080 | 9 de 9 | 6 de 6 | inteira | 219 px | 427 → 1060 (633 px) | 74% |
| 375 × 812 | 7 de 7 (6 + ◆) | 1 de 1 (ativo) | folha no rodapé | 149 px | 453 → 748 (295 px) | 66% |

A 1280 × 720 o gráfico tem 273 px de altura e a largura toda (1.160 px). A faixa da equipe não passa de 220 px; acima de
800 px de altura, todo o ganho vai para o gráfico.

## 10. Revisão com skills de design (`dataviz`, `artifact-design`)

| Heurística | O que mudou |
|---|---|
| Hierarquia: o gráfico é o protagonista | A coluna lateral (1/3 da largura) virou faixa de altura fixa acima do gráfico; o gráfico ganhou a largura toda e o resto da altura. Ficha do sinal, plaquinhas e ranking foram para depois do primeiro quadro. |
| Página completa em repouso | Abrir a tela mostra o estado final. Os "•••" só aparecem durante a sequência, por cima do texto, que já está no DOM. |
| Densidade | Balão com no máximo 3 linhas (voto, número, horizonte). O longo foi para a lousa e para a ficha. O cabeçalho ficou compacto (ícones de 44 px, seletor em uma linha). |
| Cor semântica reservada, com ícone + palavra | `--buy`/`--sell` só para compra, venda, ganho e perda; `--warn` para trava e "perto"; `--accent` para quem votou e para o selo "Acima"; `--model` (novo) só para modelos. Toda cor vem com ícone e palavra. |
| Texto em tokens de tinta, nunca na cor da série | Os rótulos do gráfico usam `--ink`/`--ink-2`; a cor vai na marca (linha, ponto, faixa). As etiquetas coloridas têm o texto na cor do fundo, com pares já provados em `contrast.contract.ts`. |
| Grade recessiva, uma escala, sem eixo duplo | Grade a 22% de `--ink-3`; preço e volume em faixas separadas do mesmo eixo de tempo; etiqueta de eixo omitida quando cairia sob uma etiqueta de nível. |
| Legenda sempre presente e hover por padrão | Legenda acima do gráfico (EMA 9, EMA 21, bandas, compra, venda, vela em formação), linha cruzada com etiqueta de hora e "● Regra ◆ Modelo" no cabeçalho. |
| Consistência dos elementos repetidos | Seis crachás com a mesma altura (44 px), a mesma faixa de cor do papel no topo e o selo no mesmo lugar; balões com a mesma largura e o mesmo bico. |
| Ritmo vertical e grade de 4 px | Alturas de 64, 44 e 56 px; espaços de 4, 8, 12 e 16 px; tipografia de 11, 12, 13, 15 e 18 px. |
| Foco e teclado | Crachá, aba da lousa, termo, dica, gráfico (←/→) e botões das dicas do ranking são focáveis com anel visível; Esc fecha a ficha e a dica. |
| Legibilidade a 1280 × 720 | Balão de 12 px a no mínimo 118 px de largura; termos sem quebra no meio (`nowrap`); lousa de 11,5 px com 296–400 px de largura. |
| Celular | Barra fixa com avatares, um balão por vez e a lousa como folha; a página nunca rola na horizontal. |

## 11. Tokens novos (`global.css`, claro e escuro)

- **Movimento**: `--motion-walk`.
- **Escritório**: `--office-wall`, `--office-seam`, `--office-floor`, `--office-floor-line`, `--desk-top`, `--desk-front`,
  `--desk-edge`, `--table-top`, `--table-front`, `--chair`, `--glass`, `--plant`, `--plant-2`, `--pot`, `--lanyard`
  (todos em `color-mix`).
- **Telas sempre escuras**: `--bezel`, `--screen*`.
- **Modelo**: `--model` (#8a3ea8 claro / #d59af0 escuro) e `--model-soft`.
- **Lousa e post-it**: `--board`, `--board-ink`, `--postit`, `--postit-ink`.
- **Luz**: `--light`, `--light-strip`.

Os pares de contraste novos entram em `contrast.contract.ts`: `--model` sobre `--surface` ≥ 4,5:1 e `--postit-ink` sobre
`--postit` ≥ 4,5:1.

## 12. Decisões A/B (A = recomendado; sem resposta, todas A)

| # | Decisão | A (recomendado) | B | Por quê A |
|---|---|---|---|---|
| D-E1 | Planta do escritório | Vista frontal | Isométrica (v1) | Texto e crachás retos; caminhar é translação simples |
| D-E2 | Crachá | Sempre visível compacto + ficha | Só ao passar o mouse | O selo protege o leigo ("não vota"); hover some no celular |
| D-E3 | Movimento | Varanda: inclinam, apontam, a Alice vem ao centro; escritório: caminham até a Alice e voltam | Só gesticulam | É o "se mexer" do pedido, ligado a um propósito |
| D-E4 | Modelos | **Na varanda**, apagados, com ◆ e "em breve"; no escritório, atrás do vidro | Só atrás do vidro (fora da varanda) | O usuário quer vê-los marcados; a forma ◆ deixa claro que não são regra |
| D-E5 | Escritório a 375 px | Lista de crachás + telão compacto | Cena rolável na horizontal | Texto ilegível e a mesa da Alice fora da vista |
| D-E6 | Vista principal | Gráfico + equipe na varanda; o escritório recolhido abaixo | Escritório no topo | O gráfico é o protagonista |
| D-E7 | Linhas de ligação | Tracejadas finas, uma acesa por vez | Sem linhas | Mostram para onde cada um olha |
| D-E8 | Trava | Post-it/placa PAUSA + luz âmbar | Só a placa | A luz nunca é a única pista |
| D-E9 | Onde fica a equipe | **Palco acima do gráfico** (varanda) | Coluna lateral (1/3 da largura) | Pedido 4; o gráfico ganha a largura toda; cabe em 1280 × 720 sem rolar |
| D-E10 | Altura | Equipe em faixa fixa de ≤ 220 px; o gráfico pega o resto (≥ 240 px) | Equipe e gráfico dividem pela metade | Em telas altas o ganho vai todo para o gráfico |
| D-E11 | Celular | Barra fixa no topo do gráfico, um balão ativo, lousa como folha | Folha da equipe no rodapé | O topo fica perto dos crachás do desktop; o rodapé é da lousa |
| D-E12 | Ordem do ranking | Limite inferior de Wilson | Acerto bruto | Não premia sorte com poucas previsões |
| D-E13 | Escada antes da 016 | Desenhar só na cena "Escada (futura)" com a marca "Cena futura" | Esconder até existir | Mostra a ideia sem fingir que o motor faz |

## 13. Honestidade

- Toda fala é frase do servidor (catálogos: §5 da 011, A17 da 007, RF17 da 014, `NextTriggersBlock` da 008). O painel só
  junta frases com "·" e formata números.
- As linhas curtas dos balões ("RSI 34,6 · banda 12,862") são números do servidor com rótulo fixo.
- Linha fixa "Simulação com dinheiro fictício · tendência, não promessa".
- "Sugestão de venda" sempre com "é a regra da simulação, não uma ordem".
- Ranking com "desempenho passado, não garantia".
- A escada diz "comprar em queda aumenta o risco".
- Os modelos nunca falam antes de existir.
- O preview usa exemplos para o tamanho da posição (87,6 LINK) e o custo (0,30% ida e volta). As velas e os acertos são
  reais (T0.2 da 007, 183 dias); as "melhores e piores dicas" são calculadas sobre as velas reais da tela.

## 14. Fora do escopo

Mudança de regra (`analyst-1`, votos, pesos, travas), rota ou consulta nova, migration, som, arrastar bonequinho,
personalização de avatar, agentes de modelo de verdade, o motor da escada (spec 016) e ordem real.

## 15. Dependências

- **Spec 007 (Fases 2 e 3)**: selo e acerto por especialista, postura da Alice, travas e proteção por tempo. Até lá vale
  a regra da v1: crachá "em observação: o auditor ainda não mede por especialista" e o "Resumo do placar".
- **Spec 014**: ficha do sinal, frases do aviso e "Copiar".
- **Spec 016**: a escada.
- **Specs 009 e 011**: gráfico, níveis e vela apontada (`pointedOpenTime`), sem consulta nova.
- **Servidor**: ranking por janela e por semana, e melhor e pior dica (a rota de projeções já dá `items` por vela).

## 16. Riscos

| Risco | Efeito | Mitigação |
|---|---|---|
| A varanda parece jogo e o leigo lê "a equipe garante" | Decisão com dinheiro real | Linha fixa, "não vota", selos, dicas que nunca prometem, ranking "não garantia" |
| Linhas de ligação viram teia | O gráfico perde o protagonismo | Uma acesa por vez; abaixo de 700 px somem |
| 720 px de altura deixam o gráfico baixo (273 px) | Leitura apertada | A varanda tem teto de 220 px; acima de 800 px tudo vai para o gráfico; a vela apontada amplia a leitura |
| Dicas cobrindo o gráfico | Atrapalham a leitura | Abrem acima do termo; fecham com Esc ou ao sair |
| ◆ Modelo lido como promessa de recurso | Expectativa | "em breve", apagados; D-E4 B disponível |
| Escada sugere estratégia pronta | Uso indevido | Só na cena futura, com "comprar em queda aumenta o risco" |

## 17. Critérios de aceite

1. Tabela do §9 reproduzida no app real (Playwright): `scrollY = 0`, crachás e balões dentro da janela, sem sobreposição,
   nas quatro janelas, nos dois temas.
2. A varanda tem no máximo 220 px a 1280 px e o gráfico tem a largura toda.
3. Apontar uma vela troca balões, ficha e linhas; Esc volta a "agora".
4. Todo termo do glossário (§6) tem dica acessível (mouse, teclado, toque, Esc), e o contrato prova que nenhum termo novo
   fica sem dica.
5. A proteção contra queda aparece com o nome, a frase e "sugestão de venda aqui"; as plaquinhas mostram % líquido grande
   e USDT pequeno, arredondados contra o usuário.
6. O ranking segue o limite inferior de Wilson; coroa só para "Acima"; "em observação" fica fora da classificação.
7. As sequências terminam em ≤ 2.500 ms, com ≤ 60 elementos animados; estado final idêntico sem animação.
8. Os modelos são distinguíveis sem cor (forma, ícone, palavra).
9. Varredura de palavras proibidas nas frases novas (RNF01 da 011) e contraste dos pares novos.

## 18. Tasks (modelo por fase, `model-economy.md`)

### Fase 1 — Vista principal (varanda)
> 🤖 Modelo: `sonnet` (T1.1 e T1.6 são `haiku`)

- **T1.1** Tokens novos e pares de contraste (§11). Aceite: `contrast`, `design-review`.
- **T1.2** `TeamBalcony` (varanda, crachás, balões, modelos ◆) e o ajuste de altura (E-RF05, E-RF06, E-RF07, E-RF04).
  Aceite: contrato de geometria com janela falsa e `touch-targets`.
- **T1.3** `TeamLeaders` sobre a varanda e o gráfico (E-RF08, E-RF10).
- **T1.4** `TeamBoard` (lousa com abas; E-RF09, E-RF17).
- **T1.5** Proteção contra queda no gráfico e plaquinhas com % (E-RF12, E-RF13), reaproveitando a ficha da 014.
- **T1.6** Glossário com exemplo e `Term` com dica acessível (E-RF18 e a tabela do §6). Aceite: contrato que varre os
  termos.
- **T1.7** Celular: barra fixa, balão ativo, lousa como folha (E-RF11).

### Fase 2 — Ranking e horizonte
> 🤖 Modelo: `sonnet`

- **T2.1** Horizonte no balão e na ficha, mais a faixa "valem até" (E-RF15).
- **T2.2** Ranking completo (E-RF16). Para com `[NEEDS CLARIFICATION]` se o servidor ainda não tiver ranking por janela.

### Fase 3 — Escritório e escada
> 🤖 Modelo: `sonnet`

- **T3.1** Palco do escritório recolhível (E-RF19, E-RF20).
- **T3.2** Sequências com Web Animations (§8).
- **T3.3** Camada "Escada" atrás da marca "Cena futura" (E-RF14), só depois da 016.

### Fase 4 — Revisão
> 🤖 Modelo: `sonnet`

- **T4.1** Medidas do §9 no app real, capturas no `evidence.md` e varredura de palavras proibidas.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute o adendo specs/011-sala-da-equipe/escritorio.md (leia também spec.md, plan.md e
evidence.md da 011 e abra docs/preview/escritorio/index.html, cena #cena=grafico-equipe, antes de começar). Uma task por
vez, na ordem do §18.
Modelos: Fase 1 → executor model=sonnet (T1.1 e T1.6 → haiku) · Fases 2 a 4 → executor model=sonnet ·
revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com tsc do painel + bun run --cwd apps/frontend-ativada test + commit isolado, evidência em evidence.md.
Só apps/frontend-ativada; nada de api, worker, packages, migration ou dependência nova.
Pare e pergunte antes de: mexer no contrato da spec 007/014/016, ranking sem rota no servidor, qualquer decisão
D-E1–D-E13 diferente de A, deploy.
```
