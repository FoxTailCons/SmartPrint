# SmartPrint: permissões, exportações e experiência mobile

**Data:** 2026-10-20  
**Status:** proposta para revisão  
**Escopo:** requisitos 21–23. O modo offline/PWA do requisito 24 permanece como fase 2.

## Objetivo e critérios de sucesso

Aplicar os perfis de acesso de forma consistente no servidor e na interface, disponibilizar exportações operacionais seguras e tornar as telas de consulta utilizáveis em celular e tablet, sem alterar os fluxos atuais de orçamento, pedido rápido, pagamento, produção ou dashboard.

Critérios de aceite:

- Nenhum perfil obtém dados ou executa ações proibidas chamando a API diretamente.
- Custos e DRE só são retornados a administradores.
- A exportação respeita permissões e período, inclui todos os registros filtrados (não apenas a página visível) e gera CSV que abre corretamente no Excel.
- Em larguras mobile/tablet, menu, listas, tabelas, filtros e ações permanecem visíveis e operáveis sem corte horizontal da página inteira.
- O layout desktop, identidade visual, links profundos e atualização por F5 no Render continuam funcionando.
- Login demo permanece ausente em produção.

## Abordagens consideradas

1. **Entrega integrada em etapas (recomendada):** primeiro RBAC no backend e interface; depois exportações usando os mesmos limites; por fim navegação e listas responsivas. Mantém permissões como base de segurança dos downloads e permite validar cada etapa isoladamente.
2. **Três entregas independentes:** reduz o escopo de cada release, mas adia a proteção uniforme e pode deixar exports ou a interface inconsistentes enquanto as entregas estiverem incompletas.
3. **Incluir offline agora:** adiciona cache, persistência e reconciliação de rascunhos, com novos riscos de conflito e exposição de dados em dispositivos. Não recomendado para esta fase, pois o requisito é explicitamente opcional.

## 1. Perfis e autorização

As regras serão verificadas nas rotas de API e espelhadas na navegação e nas telas. Esconder um botão não substitui autorização no servidor.

| Capacidade | Admin | Atendente | Produção |
|---|---:|---:|---:|
| Acesso administrativo completo, catálogo e custos | Sim | Não | Não |
| Consultar/criar/editar pedidos e orçamentos no fluxo comercial | Sim | Sim | Consulta operacional |
| Registrar pagamentos e consultar recebíveis necessários ao balcão | Sim | Sim | Não |
| Consultar caixa diário e operar abertura, sangria e fechamento | Sim | Sim | Não |
| Consultar/alterar contas a pagar | Sim | Não | Não |
| Consultar DRE, margens e custos | Sim | Não | Não |
| Consultar dados do pedido necessários à produção, sem valores ou dados financeiros | Sim | Sim | Sim |
| Alterar etapas/estado de produção e concluir a produção | Sim | Não | Sim |
| Aprovar ou alterar status comercial, excluir pedidos e alterar pagamentos | Sim | Fluxo comercial existente, exceto exclusão | Não |
| Exportar pedidos | Sim | Sim | Não |
| Exportar movimentação financeira | Sim | Não | Não |

O fluxo de pedido rápido continua permitido para atendentes, incluindo a criação já aprovada que faz parte do checkout existente. O atendente mantém as operações comerciais já disponíveis, inclusive a conversão de orçamento em pedido, mas não recebe acesso a custos, DRE ou contas a pagar. A exclusão de pedido permanece administrativa.

Para produção, a API retornará apenas os campos necessários à execução (itens, instruções, prazo, prioridade, anexos e contato necessário ao atendimento/instalação), removendo totais, pagamentos, custos, contas e informações agregadas financeiras. As rotas de leitura de clientes, produtos, PDF/WhatsApp comercial, caixa e relatórios financeiros não serão um meio indireto de contornar essa restrição. As ações de produção permitirão exclusivamente transições previstas pelo fluxo de produção.

O backend adotará middleware reutilizável de autorização por papéis e serializers/seleções compatíveis com o perfil. O frontend protegerá rotas diretas e filtrará menu, cards e ações por perfil, com resposta clara de acesso negado. Admin mantém acesso total.

## 2. Exportações

Serão disponibilizados CSV UTF-8 com BOM, separador consistente e conteúdo escapado para leitura no Excel, sem dependência adicional para gerar `.xlsx`. Valores textuais que possam ser interpretados como fórmulas serão neutralizados.

- **Pedidos:** data inicial/final de criação, número, cliente e contato, itens e quantidades, total, recebido, saldo, estado comercial e estado/prazo de produção. Não incluir custo unitário ou margem. Admin e atendente podem exportar.
- **Movimentação financeira:** recebimentos por data real do pagamento (incluindo histórico legado compatível), contas efetivamente pagas e sangrias, com data, natureza, referência/descrição, forma de pagamento quando aplicável e valor. Apenas admin pode exportar.
- Os filtros de período serão datas civis de São Paulo, validadas no servidor. O início é inclusivo e o fim inclui o dia inteiro; intervalo ausente, inválido ou invertido será rejeitado com erro explícito.
- Os downloads consultarão o conjunto completo do intervalo no servidor, independentemente de filtros locais de página ou paginação visível. A interface mostrará datas aplicadas e erros de download.
- Arquivos serão produzidos sob demanda. Não haverá exportação de clientes separada nem alteração em relatórios/DRE existentes nesta entrega.

## 3. Responsividade

- Em telas estreitas, o menu persistente será substituído por cabeçalho compacto e drawer acessível, com fechamento após navegação, suporte a teclado e estado/label acessíveis. Os itens continuam sujeitos à matriz de papéis.
- Tabelas não poderão ampliar ou cortar a página toda. Tabelas auxiliares terão rolagem horizontal contida e ações/identificadores essenciais legíveis.
- Pedidos e produção terão apresentação compacta em cartões nas larguras pequenas; filtros e ações principais deverão quebrar em linhas sem sair da viewport.
- Tablet e desktop preservam a sidebar e o design atual sempre que houver espaço suficiente.
- O trabalho cobre as telas de Pedidos, Produção, Dashboard, Contas a Receber, Contas a Pagar e Caixa, além do shell compartilhado; outras páginas com tabelas serão verificadas no inventário durante a implementação.

## Dados, erros e compatibilidade

Todas as rotas continuam autenticadas. O servidor responde 403 para perfil autenticado sem permissão e não deve confiar em `role` vindo do cliente. A autorização não altera as validações de status, pagamento, precificação ou os snapshots históricos existentes.

Erros de parâmetros de data retornam 400 com mensagem pt-BR; falhas de geração de arquivo devem retornar erro explícito antes de iniciar a resposta CSV. Nenhuma exportação será silenciosamente truncada ou substituída por dados vazios.

O Render já possui rewrite de `/*` para `/index.html`; essa regra será preservada e testada para `/pedidos`, `/producao` e rotas de detalhe com carregamento direto/F5. A autenticação de produção continua sem acesso demo.

## Validação

- Testes de autorização backend por perfil em rotas de pedidos, produção, clientes, catálogo, recebíveis, caixa, contas a pagar, dashboard e exportações.
- Testes de serialização garantindo que perfis não admin não recebam custos e que Produção não receba valores/pagamentos/DRE.
- Testes de intervalo de datas, registros legados, conteúdo integral da exportação, CSV/acentos, campos vazios e prevenção de fórmula.
- Testes frontend de menu/rotas por perfil e das ações de exportação.
- Build e suítes backend/frontend existentes.
- Validação responsiva nas larguras 375 px, 768 px e desktop, confirmando ausência de overflow global e operação do drawer/tabelas.
- Verificação do rewrite SPA configurado no Render e do comportamento de login demo em build de produção.

## Fora de escopo

- Cache offline, sincronização ou fila de pedidos e rascunhos.
- Geração de arquivo `.xlsx` nativo.
- Nova modelagem de permissões configurável por usuário.
- Refatoração de estilos sem relação com os breakpoints/telas descritos.
