import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('navigation exposes the production dashboard and a labeled desktop collapse control', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { default: Layout, navigationMenu } = await server.ssrLoadModule('/src/components/Layout.jsx');
    const { AuthProvider } = await server.ssrLoadModule('/src/context/AuthContext.jsx');
    const productionItem = navigationMenu.find((item) => item.to === '/producao');
    assert.equal(productionItem?.label, 'Dashboard de Produção');

    const html = renderToString(
      React.createElement(StaticRouter, { location: '/login' },
        React.createElement(AuthProvider, null,
          React.createElement(Layout, null, React.createElement('p', null, 'Conteúdo')))),
    );
    assert.match(html, /id="primary-sidebar"/);
    assert.match(html, /aria-label="Recolher menu lateral"/);
    assert.match(html, /aria-controls="primary-sidebar"/);
    assert.match(html, /class="w-full min-w-0 p-3 sm:p-5 lg:p-6"/);
  } finally {
    await server.close();
  }
});

test('responsive tables expose labeled cards on narrow screens', async () => {
  const styles = await readFile(new URL('../index.css', import.meta.url), 'utf8');

  assert.match(styles, /@media \(max-width: 1023px\)/);
  assert.match(styles, /\.responsive-table tbody td::before/);
  assert.match(styles, /content: attr\(data-label\)/);
});
