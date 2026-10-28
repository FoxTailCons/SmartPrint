# SmartPrint Logo Asset Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir `logo.jpeg` nos pontos compartilhados de marca do frontend e como favicon, com URLs válidas no build de produção.

**Architecture:** Importar a imagem a partir de `src` no componente `BrandMark`, que já atende login e navegação. Ajustar o CSS para não desenhar um segundo símbolo sobre a imagem e apontar o favicon do HTML de entrada ao mesmo asset processado pelo Vite.

**Tech Stack:** React, CSS, Vite, `node:test`.

**Spec:** [2026-10-28-remover-fator-molde-aplicar-logo-design.md](../specs/2026-10-28-remover-fator-molde-aplicar-logo-design.md)

## Global Constraints

- Reutilizar `frontend/src/logo.jpeg`; não criar cópia do asset nem adicionar dependências.
- Manter o texto da marca e a apresentação compacta do layout.
- Não substituir a imagem pela `logo2.png`.
- Não fazer deploy nem alterar outras superfícies visuais.

## Review Focus

- Em produção, a URL da logo deve ser emitida pelo Vite e não depender de `/logo.jpeg` em uma pasta `public` inexistente.
- A logo deve aparecer no login e no layout compartilhado; o modo compacto não deve expandir o texto.
- A imagem importada já contém o símbolo geométrico: CSS não deve sobrepor linhas nem desenhar outro símbolo.
- O favicon de produção deve resolver para o mesmo asset e o idioma/título do documento devem permanecer inalterados.

---

### Task 1: Usar o asset compartilhado no BrandMark e no favicon

**Files:**
- Modify: `frontend/src/components/BrandMark.jsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/index.html`
- Test: `frontend/src/components/Layout.test.js`

**Interfaces:**
- Produces: `BrandMark({ dark = false, compact = false })` importa `../logo.jpeg`, mantém o nome acessível da marca e conserva as classes de modo escuro/compacto.
- Consumes: `Layout.jsx` e `Login.jsx` continuam usando a mesma interface de `BrandMark`.

- [ ] **Step 1: Adicionar teste SSR em `Layout.test.js`** para confirmar que `BrandMark` renderiza uma imagem de logo importada, continua exibindo o nome SmartPrint e não depende dos pseudo-elementos usados para desenhar o símbolo anterior.
- [ ] **Step 2: Rodar o teste focado com `node --test src/components/Layout.test.js` em `frontend/`** e confirmar que ele falha com o uso atual de URL raiz.
- [ ] **Step 3: Importar `../logo.jpeg` no `BrandMark.jsx`**, remover sobreposição geométrica do `index.css` e atualizar o favicon do `index.html` para o caminho relativo processável pelo Vite.
- [ ] **Step 4: Rodar `node --test src/components/Layout.test.js` e `npm run build` em `frontend/`**; verificar que o build emite o JPEG e que o favicon no `dist/index.html` referencia esse asset.
- [ ] **Step 5: Rodar ESLint focado nos arquivos JSX alterados e `git diff --check`**; ambos devem passar.
