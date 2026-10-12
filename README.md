# AtivAdA

Simulador de operações com criptomoedas: carteira fictícia sobre preço real, estratégias por regras,
backtest com validação walk-forward e alertas de compra e venda. Numa segunda etapa, execução em
corretora por API — primeiro em testnet, depois em valor real pequeno, sempre ligada por uma pessoa.

> Os sinais são saída de regras configuradas pelo usuário e validadas em histórico. Não são
> recomendação de investimento.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/spec/constitution.md`](docs/spec/constitution.md) | Princípios que nenhuma spec pode violar |
| [`docs/spec/glossary.md`](docs/spec/glossary.md) | Termos do domínio (candle, ATR, walk-forward…) |
| [`specs/001-simulador-e-sinais/`](specs/001-simulador-e-sinais/) | Etapa 1 — dados, motor de estratégia, backtest, simulação ao vivo, alertas e painel |
| [`specs/002-execucao-em-corretora/`](specs/002-execucao-em-corretora/) | Etapa 2 — execução por API com travas, testnet e operação real assistida |
| [`docs/preview/dashboard.html`](docs/preview/dashboard.html) | Preview estático da tela principal, com dados fictícios, para apresentação |

Cada spec tem `spec.md` (o quê e por quê), `plan.md` (como), `tasks.md` (ordem de execução, modelo
por fase e critério de aceite) e `evidence.md` (prova de cada task fechada).

## Ordem de validação

```
001: Backtest → Walk-forward → Simulação ao vivo   (gate humano: relatório fora da amostra)
002: Testnet → Sombra 7 dias → Real com valor pequeno (gate humano em cada passo)
```
