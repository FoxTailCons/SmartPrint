# Especificacao: trilha administrativa de auditoria

## Objetivo

Disponibilizar para administradores uma trilha central, pesquisavel e persistente das operacoes sensiveis do SmartPrint. O registro deve identificar quem solicitou cada acao, quem a autorizou quando aplicavel, quando ocorreu, de onde veio e se foi concluida, sem armazenar credenciais ou tokens.

## Contexto e limites

- O backend usa Express e Mongoose; autenticacao usa JWT e usuarios com os papeis `admin`, `atendente` e `producao`.
- O caixa atualmente suporta abertura, sangria e fechamento. Nao existe operacao de suprimento; para atender ao evento pedido, sera adicionada uma operacao de suprimento ao caixa aberto.
- Logout atualmente e local no navegador. Sera adicionado endpoint autenticado de logout para registrar o evento antes de limpar o token local. O JWT continuara valido ate expirar; revogacao de token nao faz parte deste escopo.
- A gestao de usuarios permite ativar/desativar contas, mas nao trocar papeis. A auditoria registrara mudancas de estado de acesso existentes; alteracao de papel somente sera auditada se existir um fluxo correspondente no futuro.
- A exclusao fisica existente de pedidos e administrativa. Vendas rapidas nao podem ser excluidas. O evento sera registrado apenas quando a exclusao permitida for concluida; este trabalho nao altera as regras de exclusao.
- O cancelamento de pedidos/orcamentos e uma transicao logica; Admin cancela diretamente com motivo padrao auditavel, enquanto Atendente informa o motivo e precisa de autorizacao Admin. Pedidos com pagamentos registrados nao podem ser cancelados; autorizacoes/recusas sao registradas no mecanismo de auditoria.
- Descontos no recebimento estao em implementacao. Desconto superior a 10% sera calculado sobre o saldo do pedido imediatamente antes daquele abatimento. Um pagamento sem desconto nao e evento de desconto.

## Modelo e integridade

Criar uma colecao append-only `AuditLog` com os campos:

- `data`: data/hora UTC de gravacao.
- `usuarioSolicitante`: referencia opcional ao usuario solicitante. Pode ser nula em falha de login para conta nao identificada.
- `usuarioAutorizou`: referencia opcional ao usuario Admin que autorizou a operacao.
- `acao`: codigo estavel e pesquisavel do evento.
- `detalhes`: objeto com somente os dados necessarios para explicar a acao, incluindo identificadores e valores anteriores/novos quando relevante.
- `ip`: endereco observado pelo Express, limitado a um valor textual.
- `sucesso`: booleano indicando se a tentativa foi concluida.

Os documentos nao podem conter senha, token JWT, cabecalho de autorizacao, corpo integral de requisicao ou dados de pagamento que nao sejam necessarios para explicar a operacao. Eventos nao podem ser atualizados ou excluidos por rotas da aplicacao. Indexar data decrescente, usuario/data e acao/data para filtros e ordenacao.

## Eventos

Registrar eventos de sucesso para:

1. login e logout;
2. fechamento de caixa, sangria e suprimento;
3. exclusao permitida de pedido/venda;
4. alteracao de preco ou custo de produto, incluindo valores anterior e novo apenas para os campos alterados;
5. ativacao/desativacao de usuario;
6. desconto de pagamento acima de 10% do saldo imediatamente anterior;
7. autorizacoes administrativas de desconto e cancelamento, com solicitante e Admin autorizador.

Registrar falha em:

- tentativa de login invalida ou de conta inativa;
- tentativa de autorizacao administrativa recusada para desconto ou cancelamento, incluindo solicitante e pedido/acao, sem gravar a senha fornecida.

Falhas de validacao de negocio fora desses casos nao geram eventos nesta versao. A auditoria nao sera uma captura automatica de todas as requisicoes HTTP.

## Persistencia e erros

Cada evento e gravado pelo backend no ponto em que o resultado da operacao e conhecido. Eventos de autenticacao e de autorizacao devem ser persistidos antes da resposta que confirma sucesso ou recusa. Para mutacoes de negocio, salvar a alteracao e em seguida o evento; se a gravacao do evento falhar, registrar o erro no log do servidor e retornar erro explicito, informando que a operacao pode ter sido concluida, para evitar resposta com aparencia de sucesso sem trilha. Nao tentar desfazer silenciosamente mutacoes concluidas.

Nao usar captura ampla que ignore erros. O endpoint de logout requer token valido e nao revoga o token; seu evento descreve a solicitacao de encerramento no cliente.

## API de consulta

Adicionar endpoint autenticado e restrito a Admin para consultar eventos, com filtros opcionais:

- usuario solicitante;
- intervalo inclusivo de datas, validado e limitado a um periodo maximo de 1 ano;
- codigo de acao;
- pagina e tamanho de pagina limitados segundo os padroes existentes.

Retornar resultados em ordem decrescente de data, metadados de paginacao e somente os campos de auditoria. Tentativas sem Admin recebem 403.

## Interface

Adicionar a pagina **Gestao > Auditoria**, visivel e acessivel somente para Admin. A tela deve exibir data, solicitante, autorizador quando houver, acao, detalhes, IP e resultado, com filtros por usuario, periodo e acao e paginacao. Seguir os padroes existentes para carregamento, erros, filtros e listas. Nao oferecer edicao ou exclusao de eventos.

## Compatibilidade e seguranca

- Preservar os comportamentos e autorizacoes atuais das rotas; a auditoria complementa, nao substitui, logs de historico de pedido ou controles de caixa.
- A API e a interface de consulta sao Admin-only no backend e frontend; a restricao do frontend nao e controle de seguranca suficiente por si so.
- O campo IP depende da configuracao de proxy confiavel do Express. Nao habilitar confianca indiscriminada em `X-Forwarded-For`; registrar somente o endereco que o servidor considera observado, documentando essa limitacao.
- Nao incluir secrets em logs, erros da API, eventos ou testes.

## Testes e criterios de aceite

1. Eventos de sucesso e falha previstos sao gravados com solicitante, autorizador, IP, acao e detalhes corretos.
2. Falha de login nao expoe senha e pode ser consultada mesmo quando o usuario nao existe.
3. Recusa de autorizacao registra a tentativa sem salvar credenciais.
4. Falha ao gravar um evento nao e ocultada nem devolvida como sucesso.
5. O endpoint rejeita nao autenticados e usuarios que nao sejam Admin; filtros, datas invalidas, limites de periodo e paginacao sao testados.
6. A tela Admin filtra e pagina; perfis nao Admin nao veem o menu nem acessam a rota.
7. Sangria, suprimento e fechamento refletem os valores corretos do caixa; exclusao e alteracoes de produto preservam suas regras atuais.
8. Testes existentes de usuarios, pedidos, autorizacao e caixa permanecem verdes.
9. Cancelamentos mantem o pedido no historico, bloqueiam pagamentos posteriores e registram sucesso/recusa de autorizacao sem armazenar credenciais. Admin cancela sem modal de confirmacao e sem motivo digitado, usando motivo padrao; Atendente continua informando motivo e credenciais do Admin.

## Fora de escopo

- Revogacao ou rotacao de JWT no logout.
- Captura automatica de todas as requisicoes e validacoes rejeitadas.
- Alteracao de papel de usuario, que nao existe atualmente.
- Estorno de pagamentos ou ampliacao das regras de cancelamento previamente especificadas.
- Exportacao, retencao automatica, arquivamento ou exclusao de registros de auditoria.
