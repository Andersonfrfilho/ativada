# Escritório vivo (preview)

Preview em HTML, CSS e JS puros (sem build, sem dependências, sem API, banco ou motor) para responder à queixa de 2026-10-18: "eles não andam, não tem escritório, não tem mesas nem computadores". Nada em `apps/` foi alterado. Aprove ou ajuste antes de virar spec/implementação.

## Como abrir

- Windows: `\\wsl$\Ubuntu\home\miyazaki\personal\ativada\docs\preview\escritorio-vivo\index.html` (funciona por `file://`).
- Servidor estático: `python3 -m http.server -d docs/preview/escritorio-vivo` e abrir `http://localhost:8000`.
- Atalho: `index.html#buy`, `#sell`, `#protect`, `#wait` abre já no estado escolhido.

## O que mostra

1. Cenário isométrico leve: piso, paredes, janela com a cidade (dia/noite conforme o tema), relógio real, quadro de cotações PEPE/USDT com mini-gráfico animado, plantas, estante, sala de reunião com lousa.
2. Seis mesas com computador; cada tela tem um gráfico próprio (velas, RSI, volume, humor, risco, auditoria).
3. Os seis agentes de regra andam de verdade (rotas por corredores, sem atravessar mesas) até a mesa da Alice, ao quadro de cotações, à lousa e à mesa dos colegas; digitam, levantam a mão, trocam papéis. Ciclos aleatórios e diferentes por pessoa (Otávio faz "ronda de auditoria").
4. Equipes de modelo ◆ Nina (Gemini), Lucas (Claude), Olívia (GPT) em ala própria, crachá roxo com ◆. Só as ligadas aparecem; "ligada, sem chave" aparece esmaecida com aviso e não opina.
5. Controles no topo: situação (Esperar, Compra, Venda, Proteção), equipes de modelo, movimento, tema, disposição. Em compra/venda/proteção a Alice chama, todos vão à lousa (níveis de entrada/alvo/proteção), plaquinha com o % líquido e balões em turnos; depois de ~20 s voltam às mesas. Clicar de novo no estado repete a reunião.
6. Lado a lado: varanda compacta (faixa acima do gráfico de velas simulado, com a altura medida) e aba Escritório cheia.
7. Acessibilidade: estado sempre ícone + palavra + cor; alvos de 44 px; claro/escuro/automático; 375 px sem rolagem horizontal; legenda em lista clicável (ficha por agente); bloco "Descrição para leitor de tela" que se atualiza com a situação.

Movimento reduzido (automático por `prefers-reduced-motion`, ou pelo botão): nada anda nem pisca; poses fixas, a reunião aparece de uma vez.

Aviso fixo: "Simulação com dinheiro fictício · tendência, não promessa". Valores (0,00001240 etc.) são de exemplo.

## Arquivos

`index.html`, `css/office.css`, `js/data.js` (agentes, opiniões), `js/figure.js` (personagem), `js/office.js` (cena + simulação), `js/balcony.js`, `js/chart.js`, `js/main.js`.

## Limites conhecidos do preview

- Em 375 px o escritório cheio fica pequeno (crachás só com nome e estado); a lista abaixo carrega o detalhe. Na versão real, sugiro a varanda como padrão no celular e o escritório em tela cheia sob demanda.
- Sem teste com leitor de tela real; a descrição é por texto.

## O que decidir

1. Ritmo de movimento: ocioso a cada 2–9 s (atual) ou mais calmo? Reunião de ~20 s é boa ou prefere até o estado mudar?
2. Quantas mesas: 6 regras + até 3 modelos (atual) ou ala dos modelos só quando houver opinião nova?
3. Isométrico (este) vs. plano (`docs/preview/escritorio`, mais leve e legível em celular, sem andar em perspectiva). Pode-se manter plano na varanda e isométrico só na aba cheia.
4. Primeira versão real: sugiro varanda animada (andar de lado, mãos, papéis, balões em turnos) + aba Escritório com cenário fixo e agentes andando, sem reunião na lousa; lousa e plaquinha na segunda fase.
5. Balões em turnos (um fala por vez) vs. todos visíveis: o preview usa turnos + estado fixo no crachá.
6. Desempenho: SVG + um laço `requestAnimationFrame`; pausar quando a aba some (já pausa telas e quadro).
