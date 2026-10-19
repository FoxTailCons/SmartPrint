# Fluxo de orçamento para pedido e recibos

## Objetivo e escopo

Formalizar o fluxo comercial do SmartPrint para que um registro comece como orçamento, possa ser impresso ou enviado ao cliente e, quando aprovado, passe a representar um pedido. Cada pagamento efetivamente registrado deve ter um recibo próprio, disponível para impressão ou envio pelo WhatsApp.

O mesmo registro MongoDB, número, cliente, itens e histórico são preservados durante a conversão. Este trabalho não cria uma entidade separada para orçamento, não envia documentos automaticamente e não altera os cálculos de produção. Orçamentos ainda não aprovados não são tratados como vendas ou contas a receber.

## Fluxo e estados

1. Ao criar um registro, ele fica `pendente` e é apresentado como **Orçamento**.
2. Enquanto pendente, o usuário pode imprimir o orçamento ou preparar seu envio por WhatsApp, sem que isso o converta ou marque como aprovado.
3. A ação **Aprovar orçamento** representa a aceitação pelo cliente. Ela muda o status para `aprovado`, registra a aprovação no histórico e o mesmo registro passa a ser apresentado como **Pedido**.
4. O pedido aprovado segue os controles existentes de produção, entrega e pagamento; ao concluir a produção, o status comercial permanece `concluido`.
5. Cada recebimento efetivo é registrado em `payments` com valor, forma e data. Esse registro disponibiliza seu recibo individual para impressão ou envio por WhatsApp. A ação de recibo nunca envia automaticamente.

## Regras de documento e compatibilidade

- A geração de PDF e a mensagem de WhatsApp devem usar o estado de aprovação, não o valor já pago, para distinguir orçamento de pedido. A exceção de compatibilidade é um registro pendente com pagamentos já existentes, que permanece rotulado como pedido.
- Registros pendentes sem pagamentos são orçamentos; registros aprovados ou concluídos são pedidos, inclusive quando ainda não houve pagamento.
- Para preservar registros históricos, um registro pendente que já tenha pagamentos continua sendo apresentado como pedido. Não se exige migração dos dados existentes.
- O número, conteúdo, anexos comerciais já armazenados, pagamentos e histórico permanecem vinculados ao mesmo registro após a aprovação.
- Imprimir ou preparar o envio do orçamento não aprova o registro nem altera seu estado. A tela, listagens e ações mantêm visível essa distinção.
- Orçamentos pendentes sem pagamentos não entram em contas a receber, faturamento, receita ou métricas de vendas; pedidos existentes aprovados/concluídos e registros pendentes com pagamentos históricos continuam incluídos.

## Recebimentos e recibos

- A API rejeita novos pagamentos em registros ainda pendentes; a interface não oferece a ação de receber pagamento até o orçamento ser aprovado. Pedidos concluídos continuam aceitando recebimentos de saldo.
- Ao aprovar, a entrada configurada no formulário continua sendo registrada como recebida, conforme o comportamento atual e o texto de ajuda existente. Esse recebimento deve aparecer como pagamento do tipo `entrada`, com o recibo individual correspondente.
- Recebimentos parciais e totais posteriores continuam usando o registro `payments` existente. Cada item tem seu próprio recibo, calculado com o acumulado e o saldo após aquele pagamento.
- O recibo pode ser impresso sem telefone cadastrado. A ação de WhatsApp é mostrada somente quando há telefone válido; abrir o link prepara a mensagem para revisão pelo usuário.
- Não se cria recibo para valores apenas previstos em parcelas ou para uma entrada que não tenha sido registrada como pagamento.

## Superfícies afetadas

- **Backend:** rótulo do PDF e do texto/link de WhatsApp; validação da rota de pagamentos para exigir pedido aprovado; estatísticas de clientes sem orçamentos pendentes; preservação da compatibilidade de registros históricos e da entrada na aprovação.
- **Frontend:** rótulos e ações na tela de detalhes, formulário e listagens para deixar claro quando é orçamento e quando é pedido; ações de pagamento somente após aprovação; recibos associados a cada pagamento; orçamentos excluídos de Contas a Receber.
- **Dashboard:** separar orçamentos pendentes dos pedidos para totais, saldos, fluxo de caixa e análises de vendas, mantendo os orçamentos acessíveis na lista de pendências e no feed recente.
- **Testes:** regras de rótulo antes/depois da aprovação e para registros antigos; bloqueio de pagamentos em orçamento pendente; entrada na aprovação; recibos individuais, impressão sem telefone e preservação do envio por WhatsApp.
- **Documentação:** atualizar as descrições do fluxo e das superfícies de impressão/envio.

## Tratamento de erros e segurança

- A rota de pagamento retorna erro explícito de validação para registros pendentes e não altera saldo, parcelas, histórico ou pagamentos.
- Aprovação continua validando estado e identificador, evitando conversão duplicada.
- Erros ao gerar PDF ou abrir/imprimir recibos devem continuar visíveis pelo padrão existente; não registrar pagamento como recebido por uma falha de impressão ou envio.
- A ação de impressão não persiste mudanças; recibos usam somente dados do pagamento salvo e do pedido associado.

## Critérios de aceite

1. Um novo registro pendente aparece como orçamento em PDF e WhatsApp e pode ser impresso ou preparado para envio sem conversão.
2. Aprovar transforma o mesmo registro em pedido, sem alterar seu número ou duplicar itens/histórico anterior, e registra um único evento de aprovação.
3. Um pedido aprovado sem pagamento aparece como pedido, não como orçamento.
4. Um pedido legado pendente com pagamento existente não volta a ser rotulado como orçamento nem é removido das métricas financeiras.
5. A API e a interface impedem novo recebimento antes da aprovação e permitem receber saldo de pedidos concluídos.
6. A entrada definida no orçamento é registrada exatamente uma vez ao aprovar e tem seu próprio recibo.
7. Cada pagamento posterior produz uma opção de recibo individual com acumulado e saldo corretos; imprimir funciona sem telefone e WhatsApp permanece uma ação explícita.
8. Orçamentos pendentes sem pagamentos não aparecem como valores a receber, receita, estatísticas de vendas ou gastos do cliente; um registro pendente legado com pagamentos é preservado nas métricas.
9. Pedidos existentes sem campos novos continuam carregando; testes focados e build do frontend passam.

## Abordagens consideradas

1. **Um registro com transição de estado (escolhida):** usar `pendente` como orçamento e `aprovado`/`concluido` como pedido, mantendo número, histórico e pagamentos. Ajusta os rótulos documentais e as regras de recebimento sem duplicar dados.
2. **Entidades separadas para orçamento e pedido:** copiar dados durante conversão exigiria preservar referências, pagamentos e histórico, além de resolver sincronização e duplicidade. Não é necessário para o fluxo solicitado.
3. **Converter no primeiro pagamento:** mistura aceitação comercial com recebimento e impede tratar corretamente um pedido aprovado que ainda não recebeu valores. A ação de aprovação já existe e representa melhor a transição.

## Premissas

- Aprovar orçamento é a confirmação de aceitação pelo cliente e o gatilho de conversão.
- A entrada preenchida no orçamento é uma entrada que será recebida ao aprovar, como o formulário e o comportamento atuais informam.
- “Emitir recibo” significa disponibilizar o documento individual para impressão ou envio explícito; não significa disparo automático.
- Não é necessária migração para registros existentes.
