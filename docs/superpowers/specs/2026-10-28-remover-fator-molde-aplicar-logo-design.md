# Remover fator de molde e aplicar logo

## For agentic workers

- Leia esta especificação antes de implementar.
- Esta decisão substitui somente os requisitos anteriores de manter o fator de molde em novos pedidos; os demais requisitos do catálogo e da produção permanecem válidos.
- Preserve os campos de molde já salvos e o comportamento de itens legados ao editar pedidos existentes.
- Planos de implementação relacionados: [[2026-10-28-remover-fator-molde]] e [[2026-10-28-aplicar-logo-jpeg]].

## Objetivo

Retirar o fator de molde dos novos fluxos de orçamento e cálculo, mantendo pedidos históricos intactos, e aplicar `frontend/src/logo.jpeg` de forma consistente nas superfícies compartilhadas de marca do frontend.

## Escopo

- Remover controles, estado e cálculo do fator de molde da calculadora de medidas e da seleção de produtos por m² no formulário de pedidos.
- Calcular novos itens por m² somente com dimensões, unidade e quantidade de peças.
- No servidor, não aceitar um fator enviado pelo cliente para novos itens de catálogo.
- Preservar campos existentes no modelo e usar os valores já persistidos somente para manter o comportamento de itens de catálogo históricos ao editar seu pedido.
- Atualizar testes do frontend e backend para cobrir o cálculo sem fator, a rejeição/ignorância do fator em novos itens e a preservação de itens legados.
- Atualizar os documentos de catálogo e produção que descrevem o fator como opção disponível.
- Importar `logo.jpeg` pelo pipeline de assets do Vite no `BrandMark`, reutilizado no login e no layout. Manter o texto da marca e a apresentação compacta.
- Usar a mesma imagem como favicon e remover a marca geométrica duplicada atualmente desenhada por CSS.

## Fora de escopo

- Apagar ou migrar dados de pedidos existentes, reprecificar pedidos históricos ou remover campos legados do modelo.
- Alterar outros métodos de precificação, produtos, fluxos de produção ou identidade visual além da aplicação do arquivo solicitado.
- Usar `logo2.png` no lugar de `logo.jpeg`.
- Fazer commit de código, push ou deploy da aplicação.

## Compatibilidade e comportamento

- Para novos itens square-meter, a quantidade vendida é a área convertida para metros quadrados por peça vezes a quantidade de peças, sem multiplicador de molde.
- Valores legados `moldEnabled` e `moldFactor` continuam armazenados para não perder dados e podem ser usados ao recalcular um item já persistido correspondente. O servidor não deve aplicar esses campos recebidos do cliente a um novo item.
- Itens manuais e itens de catálogo não relacionados a m² mantêm seu comportamento atual.
- A logo quadrada será importada de `src` para que o Vite gere uma URL válida em produção; a utilização comum cobre navegação e login. O favicon apontará para o mesmo asset processado pelo Vite.

## Validação

- `npm test` em `frontend/` e `backend/`, executados com `node --test`.
- `npm run build` em `frontend/`.
- ESLint focado nos arquivos React/CSS alterados, quando suportado pelo script existente.
- Conferência do bundle HTML para confirmar que o favicon aponta para o asset emitido e inspeção do diff para confirmar que não houve migração nem inclusão de cópia paralela da logo.
- Regenerar `graphify-out/` conforme a regra do repositório, sem incluir cache de execução.

## Decisões e trade-offs

- Remover o recurso de novos fluxos reduz a chance de futuros pedidos receberem multiplicadores inesperados.
- Preservar o comportamento legado evita mudanças silenciosas em pedidos já aprovados, ao custo de manter temporariamente a compatibilidade interna dos campos.
- Um `BrandMark` compartilhado mantém a identidade consistente entre login e layout sem prejudicar o modo compacto da navegação.

## Evidência e precedência

A especificação aprovada anteriormente em `docs/superpowers/specs/2026-10-20-printshop-workflow-design.md` exigia manter o fator de molde. Esta especificação posterior registra a decisão atual do usuário e substitui apenas esse trecho para novos pedidos. A especificação original permanece como histórico das demais decisões.
