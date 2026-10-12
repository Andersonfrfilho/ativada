# Pendência regulatória: fatos e perguntas para um advogado

> **Este documento não é parecer jurídico.** Quem o escreve é um engenheiro (e uma I.A.). Ele reúne
> **fatos sobre o produto** e **perguntas** para o responsável levar a um advogado com experiência em
> mercado de capitais e criptoativos. As referências legais abaixo foram citadas de memória, só para
> orientar a conversa; o advogado deve conferir cada uma (número, vigência e redação atual). Nada aqui
> afirma que o produto está ou não está regular.

Origem da pendência: `specs/001-simulador-e-sinais/spec.md` ("Pendência regulatória") e
`specs/002-execucao-em-corretora/spec.md` ("Pendência regulatória (bloqueia a Fase 6)"). O gate
humano T6.4 pede que o responsável pelo produto leia este documento e o relatório de walk-forward
(`docs/relatorio-walk-forward.md`) e registre a decisão em `evidence.md`.

## 1. O produto como é hoje (fatos)

1. **Simula, não opera.** Dinheiro fictício, mercado à vista (BTC/USDT, ETH/USDT), dados públicos de
   preço da Binance (sem chave). Nenhuma ordem real é enviada a ninguém.
2. **Sem custódia.** O sistema nunca recebe, guarda ou movimenta dinheiro ou criptoativo de usuário.
3. **Sem chave de corretora.** Hoje não existe cadastro de chave de API de corretora. Os ativos que o
   usuário "tem de verdade" (RF15) são **digitados** por ele (par, quantidade, preço médio).
4. **Sinais vêm de regras públicas e configuráveis:** médias móveis (EMA), MACD, RSI, OBV e regime
   ADX, combinados numa pontuação. Cada usuário cria e ajusta as próprias regras; a estratégia
   "Placar clássico" é um **exemplo editável** entregue uma vez a cada usuário novo.
5. **Há partes que se aproximam de orientação individual**, e o advogado deve ler com atenção:
   - o **alerta** de compra/venda traz par, preço, pontuação, motivo, "ação simulada", stop, alvo e a
     taxa de acerto histórica da regra (RF10), no painel e, opcionalmente, no **Telegram** do usuário;
   - a **meta** (RF13) ranqueia combinações estratégia/par por "taxa de chegada" no histórico e mostra
     um **plano de operação** (preço de compra, alvo, stop, condição de venda);
   - em **Seus ativos** (RF15), para moedas que o usuário declara possuir, o painel mostra o que a
     estratégia ativa "diria hoje" (manter, sinal de venda, ficar fora) e preços de alvo e stop sobre o
     preço médio dele (padrão +10% / −8%).
6. **Linguagem e avisos hoje:** aviso permanente "Simulação — sinais são saída de regras, não
   recomendação de investimento" no painel; o texto das metas evita "vai ganhar" e diz "chegou à meta
   em X% das janelas do histórico". **Nenhum desses textos foi revisado por advogado.**
7. **Quem usa:** apenas o responsável pelo produto e uma simulação de teste. **Nenhum usuário externo
   e nenhuma cobrança** hoje. O desenho prevê cadastro **por convite** (o administrador convida).
8. **Dados pessoais tratados:** e-mail e credenciais (no Keycloak), preferências, **chat do Telegram**
   vinculado, estratégias, metas, **ativos digitados** (dado financeiro pessoal), alertas e trilha de
   auditoria (IP guardado por 90 dias; linha de auditoria por 730 dias). Há exportação e exclusão da
   própria conta (RNF08). O administrador **não** vê estratégias, carteiras nem alertas dos usuários.
   Segredos e dados pessoais não vão para log. Pendência técnica conhecida: o `telegram_chat_id` ainda
   está em texto no banco (cifra decidida como pendência do responsável).
9. **Não existem** hoje termos de uso, política de privacidade, texto formal de aviso de risco,
   política de retenção publicada nem canal de encarregado (DPO).
10. **Resultado histórico honesto:** o relatório `docs/relatorio-walk-forward.md` mostra o desempenho
    fora da amostra da estratégia de exemplo, com custos. Em medições anteriores a estratégia perdeu
    dinheiro líquido de custos nos dois conjuntos reais testados (`specs/001-simulador-e-sinais/evidence.md`).
    Isso importa para publicidade: o produto não tem, hoje, resultado histórico favorável para exibir.

## 2. O que a spec 002 mudaria (fatos)

1. **Execução por API em corretora** (primeira: Binance; depois Mercado Bitcoin e Foxbit), por
   usuário, usando o mesmo motor de estratégias.
2. **Chave de API do próprio usuário**: ele a cadastra; fica cifrada (AES-256-GCM, chave de aplicação
   fora do banco), nunca volta em resposta, é recusada se permitir saque ou, em `live`, se não tiver
   restrição de IP. Cadastrar ou trocar exige senha + TOTP recente. A plataforma **não** custodia
   fundos: só opera spot na conta do usuário, dentro de tetos definidos por ele.
3. **Escada de subida, cada degrau com gate humano:** testnet (7 dias) → sombra em real, sem ordens
   (7 dias) → real pequeno (tetos mínimos, ex.: R$ 50 por ordem, 30 dias) → ajuste de tetos.
4. **"O usuário arma, a IA nunca":** `live` exige plataforma habilitada, chave real do usuário e o
   próprio usuário armando (confirmação digitada + TOTP) a cada início do processo. Nem o
   administrador arma pelo usuário; ele só tem kill switch global que desarma.
5. **Travas:** teto por ordem, ordens por dia, perda máxima diária e total, exposição máxima, kill
   switch (API e `/stop` no Telegram), ordem limitada, idempotência, reconciliação e relatório
   diário de sombra.
6. **Registro fiscal:** cada preenchimento com cotação USDT/BRL e valor em R$, exportação CSV mensal.
   O sistema **não** calcula imposto.
7. **Fora de escopo declarado:** futuros, margem, alavancagem, venda a descoberto, saque,
   transferência e custódia.
8. **O texto da spec 002 já bloqueia** o `live` para qualquer pessoa além do próprio responsável
   enquanto um advogado não validar enquadramento na CVM, termos de uso e responsabilidade e
   obrigações da Receita (corretora estrangeira).

## 3. Perguntas ao advogado

Legenda: **[E]** precisa de resposta **antes de abrir para qualquer usuário externo** (mesmo só
simulação); **[X]** precisa de resposta **antes de qualquer execução para quem não é o proprietário
do produto**; **[C]** só se houver cobrança.

### 3.1 CVM: análise, recomendação e consultoria

1. [E] Os sinais de compra e venda, os alertas com stop e alvo e o plano de operação (RF10 e RF13)
   configuram **análise** ou **recomendação** de investimento, ou **consultoria de valores
   mobiliários** (Resoluções CVM 19, 20 e 21 de 2021 são o ponto de partida a conferir)? O fato de
   o usuário criar e editar as regras muda a resposta? E o fato de o produto **entregar** a
   estratégia "Placar clássico" a todo usuário novo?
2. [E] "Seus ativos" (RF15) mostra, para a moeda que o usuário diz possuir, o que a estratégia
   "diria hoje" (manter, sinal de venda, ficar fora). Isso individualiza a orientação? Existe forma
   segura de apresentar essa informação (ou deve sair do produto)?
3. [E] Os ativos hoje cobertos (BTC e ETH, e a stablecoin USDT usada como cotação) são **valores
   mobiliários** perante a CVM? Qual o efeito do Parecer de Orientação CVM 40/2022 e de futuras
   mudanças? Há risco de um par futuro (outro token) ser valor mobiliário sem que o produto perceba?
4. [X] Executar ordens na conta de terceiro, com regras do próprio terceiro, é **administração de
   carteira** (Resolução CVM 21) ou apenas ferramenta de software? A diferença está em quem escolhe a
   estratégia, quem arma, quem define os tetos, ou em quem escreve o código?
5. [X] A estratégia de exemplo, quando é a que o usuário acaba executando, desloca a
   responsabilidade para o produto? Que desenho (ex.: estratégia só do próprio usuário, sem exemplo
   no `live`) reduziria o risco?

### 3.2 Banco Central: prestadores de serviços de ativos virtuais

6. [E] A Lei 14.478/2022 (marco legal dos criptoativos), o Decreto 11.563/2023 e a regulamentação
   do Banco Central em vigor (resoluções BCB sobre sociedades prestadoras de serviços de ativos
   virtuais, a conferir) alcançam um software que **só mostra sinais** e simula? Alcançam um
   software que apenas **lê** o saldo por chave somente leitura?
7. [X] Enviar ordens de compra e venda por API, na conta do usuário em corretora de terceiros, é
   **intermediação** ou outra atividade reservada a prestadora autorizada? A resposta muda se o
   sistema roda no servidor do operador ou no ambiente do próprio usuário?
8. [X] A corretora estrangeira (Binance) e a conta em outro país geram obrigação para o produto ou
   só para o usuário (câmbio, remessa, reporte)? Operar com corretora nacional (Mercado Bitcoin,
   Foxbit) simplifica?

### 3.3 Publicidade, linguagem e avisos

9. [E] O que o produto pode dizer sem ser publicidade de investimento: "sinal", "alerta",
   "recomendação", "taxa de acerto histórica", "taxa de chegada à meta"? Quais palavras evitar?
10. [E] Exibir **resultados de backtest e walk-forward** (simulados, com custos modelados) exige
    algum aviso padronizado ou limitação (período, custos, risco, "rentabilidade passada não
    garante")? O relatório deste repositório pode ser mostrado a terceiros?
11. [E] O aviso permanente atual ("Simulação — sinais são saída de regras, não recomendação de
    investimento") é suficiente? Onde e com que destaque precisa aparecer (painel, Telegram, e-mail,
    site, redes)? Em alertas de Telegram, que geralmente são lidos fora do painel?
12. [X] Quais avisos de risco específicos para execução real (perda total, volatilidade, falha
    técnica, ordem não preenchida, diferença entre simulação e real) e com que forma de aceite
    registrado?
13. [E] Convidar pessoas por indicação e divulgação em comunidade/rede social muda o enquadramento
    (oferta ao público)?

### 3.4 Termos de uso, privacidade e LGPD

14. [E] Quais cláusulas mínimas de **termos de uso**: natureza de simulação, ausência de
    recomendação, limitação de responsabilidade, regras de convite e encerramento, uso aceitável?
15. [E] **Política de privacidade e base legal (LGPD, art. 7º):** execução de contrato, consentimento
    ou legítimo interesse para cada tratamento (conta, alertas, ativos digitados, metas, auditoria)?
    Os **ativos digitados** são dado financeiro sensível para fins de cuidado reforçado?
16. [E] **Papéis:** o operador do produto é **controlador**? Quem são os **operadores**: provedor de
    hospedagem/banco, Keycloak (auto-hospedado), serviço de e-mail? Há contrato com cada um?
17. [E] **Telegram como operador?** O usuário vincula o próprio chat para receber alertas. O Telegram
    é operador, controlador independente ou terceiro? Há **transferência internacional** (LGPD,
    art. 33) e qual mecanismo a cobre? Como informar isso ao usuário? O conteúdo dos alertas
    (par, preço, ação simulada) pode ser tratado como dado financeiro pessoal ao ser enviado?
18. [E] **Retenção:** prazos para auditoria (hoje 730 dias; IP 90 dias), alertas enviados, execuções
    guardadas, backup, e a relação com o Marco Civil da Internet (guarda de registros de acesso). O
    que apagar quando a conta é excluída e o que precisa ser mantido?
19. [E] **Direitos do titular e encarregado:** o canal, o prazo de resposta e o texto; a
    exportação (NDJSON) e a exclusão atuais atendem?
20. [E] **Incidente:** qual o procedimento e o prazo para comunicar a ANPD e os titulares (LGPD, arts.
    46 a 48)? O que conta como incidente numa base com e-mails e chats do Telegram?
21. [X] **Decisão automatizada (LGPD, art. 20):** quando o sistema decide e envia uma ordem, o titular
    precisa de revisão humana, explicação ou aviso específico?

### 3.5 Responsabilidade, chaves e perfil do investidor

22. [X] **Responsabilidade por perdas:** como delimitar a responsabilidade por prejuízo causado por
    defeito de software, falha de conexão, ordem duplicada, atraso, corretora fora do ar, ou pela
    própria estratégia do usuário? O Código de Defesa do Consumidor limita cláusulas de exclusão?
23. [X] **Guarda de chaves de API:** o produto passa a guardar credencial que movimenta patrimônio de
    terceiros (mesmo sem saque). Que dever de segurança, seguro, auditoria independente ou
    certificação é esperado? Quem responde se a chave vazar do produto?
24. [X] **Idade e perfil (suitability):** é preciso verificar maioridade, perfil de risco, experiência
    ou patrimônio antes de liberar o `live`? Pode-se exigir teste de adequação sem virar atividade
    regulada?
25. [X] **Mercado Bitcoin e Foxbit:** os termos de API dessas corretoras (e da Binance) permitem
    automação de terceiros, uso comercial e exibição de dados de mercado a outras pessoas?
26. [E] Os termos da Binance para redistribuição de **dados de mercado** (preços públicos exibidos em
    gráficos e alertas) permitem uso num produto aberto a terceiros?

### 3.6 Tributação (apenas apontar)

27. [X] O sistema exporta o registro de cada preenchimento com cotação USDT/BRL. O advogado
    tributarista deve dizer se isso cria obrigação acessória para o operador ou para o usuário (a
    Receita tem regras de informação de operações com criptoativos, a conferir: IN RFB 1.888/2019 e
    normas posteriores) e se há risco de o produto parecer "calculador de imposto".
28. [X] Ganho de capital em criptoativos, limite mensal de isenção e operações em corretora
    estrangeira: apenas confirmar que o produto **não** deve apurar imposto, e que o texto deixa isso
    claro ao usuário.

### 3.7 Se houver cobrança

29. [C] Cobrar assinatura, taxa por operação ou participação no resultado muda o enquadramento
    (consultoria remunerada, administração de carteira, taxa de performance)? Quais registros e
    licenças?
30. [C] Que obrigações de consumo (CDC), nota fiscal, tributação sobre serviço (ISS) e política de
    reembolso se aplicam? É preciso pessoa jurídica específica?
31. [C] Cobrança por plano em que a "taxa de acerto histórica" é argumento de venda: quais limites de
    publicidade?

## 4. Perguntas transversais

32. [E] Qual a **ordem de passos** recomendada: abrir convites só com simulação, depois somente
    leitura de saldo, depois execução? Cada passo precisa de nova validação?
33. [E] Que **documentos** o advogado quer ver para dar o parecer? Sugestão do que entregar:
    `docs/relatorio-walk-forward.md`, `specs/001-simulador-e-sinais/spec.md`,
    `specs/002-execucao-em-corretora/spec.md`, `docs/adr/0001-autenticacao-e-isolamento.md`, capturas
    das telas e dos textos de aviso, e a lista de dados pessoais tratados (seção 1, item 8).
34. [E] Há necessidade de **seguro de responsabilidade civil** ou de uma **pessoa jurídica
    separada** para isolar o risco do operador antes do primeiro usuário externo?

## 5. Decisão do responsável

Preencher **só depois** de ler o relatório de walk-forward e as respostas do advogado, quando houver.
Nenhuma opção está marcada: quem decide é o responsável pelo produto, e o registro vai para
`specs/001-simulador-e-sinais/evidence.md`.

| Opção | O que significa | Pode ser escolhida quando | Riscos e custos | Escolha |
| --- | --- | --- | --- | --- |
| **A** | Seguir para a spec 002 **só para o próprio responsável** (testnet → sombra → real pequeno, com a própria chave) | O responsável aceita o risco de perda do próprio dinheiro, leu o relatório e entende que a simulação não garante o real; nenhum terceiro usa o sistema | Perda do capital usado; a execução real é pior que a simulação (slippage, latência); a estratégia de exemplo não mostrou ganho líquido de custos no histórico; segurança da chave sob responsabilidade só dele | |
| **B** | Abrir a **convidados só com simulação** (sem chave, sem ordens) | Textos de aviso, termos de uso e política de privacidade revisados; resposta do advogado às perguntas marcadas [E]; Telegram e retenção tratados | Risco regulatório de sinais/alertas (3.1); LGPD (3.4); expectativa criada em quem vê um resultado histórico fraco | |
| **C** | **Parar e revisar a estratégia** antes de qualquer outra passagem | O relatório mostra retorno fora da amostra abaixo de comprar e segurar, alerta de overfitting aceso ou resultado sensível a parâmetros vizinhos, e o responsável prefere melhorar o motor/estratégia primeiro | Tempo de desenvolvimento; novas estratégias também precisam passar por walk-forward honesto, sem escolher o que "deu certo" | |
| **D** | **Contratar parecer jurídico** antes de qualquer das anteriores | O responsável quer segurança sobre enquadramento antes de decidir; ou vai abrir para terceiros ou cobrar | Custo e prazo do parecer; pode condicionar o desenho do produto (retirar o plano de operação, alterar linguagem, separar pessoa jurídica) | |

Observações para a decisão:

- As opções não são excludentes em todos os casos: D pode preceder B, e C pode ocorrer em paralelo a
  D. A opção A, por envolver dinheiro real do responsável, **não depende** de parecer, mas as etapas
  de subida da spec 002 continuam valendo (cada degrau é um gate humano).
- Qualquer uso por terceiros (opção B ou execução para não proprietário) depende das respostas às
  perguntas [E] e [X], respectivamente.
- Este documento e o relatório não decidem nada: servem de base para o registro da decisão.
