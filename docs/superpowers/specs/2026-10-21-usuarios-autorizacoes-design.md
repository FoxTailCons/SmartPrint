# Usuários e autorizações administrativas

## Objetivo

Permitir que administradores cadastrem contas de Atendente e Produção e exigir autorização verificável de um administrador quando um atendente concede desconto ao receber um pagamento ou cancela um pedido/orçamento. Preservar a separação entre operações comerciais, financeiras e de produção, com trilha de auditoria.

## Escopo e papéis

- Somente Admin pode criar, listar e desativar usuários. Não há cadastro público.
- A criação requer nome, e-mail único normalizado, papel `atendente` ou `producao` e senha inicial válida. Senhas são armazenadas somente como hash, usando o hook bcrypt existente; respostas e listagens nunca incluem hashes.
- Atendente mantém as permissões comerciais e de recebimento existentes. Pode solicitar autorização administrativa para desconto no recebimento ou cancelamento.
- Admin pode efetuar essas operações sem uma segunda autorização e pode autorizar ações de Atendente informando suas próprias credenciais.
- Produção mantém somente as permissões operacionais atuais; não pode iniciar desconto nem cancelamento.
- Usuários podem ser desativados. Não permitir que o Admin desative a própria conta nem o último Admin ativo. Contas desativadas não podem autenticar nem autorizar operações.

## Autorização administrativa

- A interface pede e-mail e senha do Admin no momento da operação que necessita autorização.
- A API verifica as credenciais contra uma conta ativa com papel Admin. A senha nunca é salva, incluída em logs, no histórico ou reutilizada como credencial de sessão.
- A validação é feita pelo servidor na mesma requisição que efetua a operação; não aceitar apenas um indicador de confirmação enviado pelo frontend.
- Respostas de erro devem distinguir credencial de autorização inválida e dados de operação inválidos, sem confirmar detalhes desnecessários da conta.
- Registrar no histórico o usuário Atendente solicitante, o Admin autorizador, a ação e os valores relevantes, nunca a senha.

## Desconto ao receber pagamento

- O desconto desta funcionalidade é um abatimento fixo em reais sobre o saldo pendente; não altera o desconto comercial original do orçamento/pedido.
- O formulário de recebimento permite informar o valor efetivamente pago e o desconto autorizado, com motivo obrigatório. O total aplicado (pagamento + desconto) não pode exceder o saldo anterior; o desconto não pode ser negativo.
- Desconto maior que zero exige credenciais de Admin. Desconto zero não exige autorização.
- O pagamento continua registrado em `payments` somente pelo valor realmente recebido. O desconto é guardado separadamente como evento financeiro/auditoria, com valor, motivo, atendente, administrador e data; não deve aumentar `amountPaid` nem ser somado como entrada de caixa.
- O saldo, estado de quitação, parcelas em aberto, relatórios de recebimentos, exportações e recibos devem refletir que o desconto abate o saldo sem representar dinheiro recebido. A aplicação do desconto deve ser atômica para não deixar pagamento parcial sem auditoria nem saldo inconsistente.
- Não suportar desconto percentual nesta entrega.

## Cancelamento

- “Cancelar” é uma transição de estado com preservação do registro e do histórico, não exclusão física.
- Admin pode cancelar diretamente; Atendente exige credenciais de Admin. Produção não inicia cancelamentos.
- Cancelamento exige motivo. O pedido/orçamento não pode ter qualquer pagamento registrado; enquanto não existir fluxo de estorno, pedidos com pagamentos ficam bloqueados para cancelamento.
- Pedido cancelado não aceita novos pagamentos, aprovação, edição comercial, avanço de produção, conclusão ou novo cancelamento.
- O status `cancelado` não deve ser confundido com `concluido`. Registrar usuário solicitante, Admin autorizador quando aplicável, motivo e data no histórico.
- Pedidos cancelados ficam consultáveis no detalhe/histórico, mas são excluídos de produção ativa, urgências, receitas, saldos a receber, contagens de pedidos ativos, comparativos e exportações financeiras. Listas gerais podem oferecê-los como estado histórico, sem reativação.
- Não oferecer exclusão física como fluxo normal de cancelamento.

## Superfícies afetadas

- **Backend:** endpoints Admin-only de usuários; validação/autorização de Admin; modelo e rotas de pagamento/cancelamento; proteção das transições de pedidos; projeções e filtros de dashboard, produção, caixa, recebíveis, recibos e CSV.
- **Frontend:** administração de usuários para Admin; modal de recebimento com valor pago, abatimento, motivo e credenciais do Admin quando necessário; ação de cancelamento com motivo e autorização; indicação de estado cancelado e acesso ao histórico.
- **Documentação:** descrever administração, papéis, autorização, descontos e limite de cancelamento sem estorno.

## Regras de segurança e integridade

- A autorização deve ser validada no backend e vinculada a uma conta Admin ativa; o frontend não é fonte confiável para identidade ou valor do desconto.
- Operações com pagamento, desconto e histórico devem ser persistidas em uma única operação atômica ou transação suportada pelo MongoDB. Falhas explícitas não podem retornar sucesso parcial.
- Proteger contra valores não finitos, negativos, desconto superior ao saldo, pagamento mais desconto superior ao saldo, IDs inválidos e tentativas de editar/cancelar estados finais.
- Nenhuma API de usuários deve devolver senha ou hash. Exigir senha forte mínima e impedir e-mail duplicado.
- A listagem e as mensagens de erro não devem expor credenciais, hashes nem dados sensíveis.

## Critérios de aceitação e testes

1. Admin cria e lista usuários Atendente/Produção; perfis não-admin recebem 403; duplicidade, papel admin enviado no cadastro e senha inválida são rejeitados.
2. Usuário inativo não autentica nem autoriza; nenhum hash aparece em respostas.
3. Admin não consegue desativar a própria conta nem o último Admin ativo.
4. Recebimento sem desconto mantém comportamento atual. Desconto zero não solicita autorização; desconto positivo sem credenciais, com senha incorreta, usuário inativo ou não-admin é rejeitado sem mutação.
5. Pagamento mais desconto nunca excede o saldo. O pagamento incrementa recebimentos somente pelo valor monetário efetivamente pago; o desconto reduz o saldo sem aparecer como entrada de caixa.
6. Autorização e motivo ficam auditados; segredos não aparecem no histórico, recibo, exportações ou logs.
7. Admin pode operar diretamente sem reautenticação; Atendente só conclui ação protegida com credenciais Admin válidas; Produção é negada.
8. Cancelamento sem pagamentos funciona e mantém o registro/histórico; motivo e responsáveis são registrados. Pedido com pagamento é bloqueado sem alterar nada.
9. Pedido cancelado não pode receber pagamento, ser aprovado, editado comercialmente ou movimentado na produção; não aparece em métricas, produção ativa, urgências, recebíveis ou exportações financeiras.
10. Fluxos legados sem descontos/cancelamentos continuam compatíveis; testes do backend e frontend e build passam sem acessar banco de produção.

## Premissas desta proposta

- O termo “descontos” refere-se a abatimentos dados no momento de receber pagamentos, não ao desconto comercial já presente no orçamento.
- O abatimento é valor fixo em reais, aplicado ao saldo que resta depois do pagamento informado.
- O cancelamento preserva o histórico e é permitido somente quando nenhum pagamento foi registrado; estornos são fora do escopo.
- Acesso de Produção permanece limitado às tarefas existentes.
- Nenhuma senha de Admin é armazenada para uso posterior; cada autorização verifica a senha novamente no servidor.

## Decisões pendentes de revisão

- Confirmar se o fluxo de desconto fixo e cancelamento sem pagamento atende à operação.
- Confirmar se o desenho deve também incluir alteração/redefinição de senha de usuários ou se o cadastro e a desativação são suficientes para esta entrega.
