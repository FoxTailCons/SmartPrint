# Regras de edicao (para agentes/Codex)

1. **NUNCA crie arquivos de backup, copia ou versao paralela.**
   Proibido: `auth_backup.js`, `Orders.jsx.new`, `*.bak`, `*.orig`, `*.fixed`,
   `*.final`, `arquivo2.js`, ou qualquer variante com sufixo/prefixo de versao.
2. Edite sempre o **proprio arquivo original** no lugar. O versionamento fica
   por conta do Git — se precisar desfazer, usa `git revert`/`git checkout`.
3. Se quiser testar uma abordagem alternativa, crie uma **branch separada**,
   nunca arquivos paralelos no mesmo diretorio.
4. Ao final de qualquer tarefa, remova qualquer arquivo temporario que tiver criado.
5. Nao commitete arquivos de debug/lixo (`fix.js`, `*_verify.txt`, logs).

## Testes (obrigatorio)

- Framework unico: **`node --test`**. Nao adicione jest/mocha/vitest.
- Rodar sempre antes de commitar:
  - `cd backend && npm test`
  - `cd frontend && npm test`
- **Nao commite com teste quebrando.** Se sua mudanca quebrar um teste
  existente de proposito, atualize o teste e mencione no commit.
- Onde colocar:
  - Backend: `backend/tests/<funcionalidade>.test.js`
  - Frontend: ao lado do arquivo, ex: `hooks/useX.test.js`,
    `components/X.test.js`, `pages/X.test.js` (padrao ja existente).
- Sempre que criar/alterar **regra de negocio** (precificacao, saldo,
  parcelamento, permissoes RBAC, paginacao, filtros), crie ou atualize o
  teste correspondente. Cobertura de UI trivial nao e obrigatoria.
- Ao final da tarefa, rode as duas suites e confirme `100% pass`.

## Graphify (use antes de mudar arquivos centrais)

- O grafo de dependencias do projeto esta em `graphify-out/graph.json`
  (comunidades em `.graphify_analysis.json`).
- **Antes de modificar** arquivos centrais (`backend/models/Order.js`,
  `backend/routes/auth.js`, `frontend/src/api.js`,
  `frontend/src/components/Layout.jsx`, `frontend/src/roleAccess.js`,
  `frontend/src/App.jsx`), consulte o grafo para identificar todos os
  dependentes e avaliar o impacto. Nao mude no escuro.
- Apos mudancas estruturais (adicionar/remover arquivos, mudar exports),
  rode o Graphify para atualizar `graphify-out/`.
- Nao commite alteracoes em `graphify-out/cache/` (lixo de execucao).

## Obsidian / Documentacao (docs/superpowers)

- O vault de notas do projeto fica em **[preencha com o caminho do seu vault]**.
  Os planos e specs do repo em `docs/superpowers/` fazem parte desse vault.
- **Antes de implementar** qualquer feature, leia o plan correspondente em
  `docs/superpowers/plans/` e o design spec em `docs/superpowers/specs/`.
  Nao invente escopo — siga o que esta documentado.
- Ao iniciar uma feature nova, crie:
  - `docs/superpowers/plans/YYYY-MM-DD-slug.md` (plano de implementacao)
  - `docs/superpowers/specs/YYYY-MM-DD-slug-design.md` (se houver design)
    seguindo o padrao dos arquivos existentes (cabecalho, "For agentic workers",
    secoes de escopo/fora-de-escopo/validacao).
- Use **links bidirecionais** `[[nota-relacionada]]` entre planos, specs e
  notas de decisao.
- Ao finalizar a feature, volte na nota e registre o resultado, desvios e
  decisoes tomadas.
  "Ao final de toda tarefa que tocar na estrutura de arquivos, execute graphify (ou o comando que voce usa) para regenerar o grafo."
