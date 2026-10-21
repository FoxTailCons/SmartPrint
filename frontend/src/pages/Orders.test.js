import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('orders page shows accessible tabs including canceled orders', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { default: Orders } = await server.ssrLoadModule('/src/pages/Orders.jsx');
    const html = renderToString(React.createElement(StaticRouter, { location: '/pedidos' }, React.createElement(Orders)));

    assert.match(html, /role="tablist"/);
    assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>Pendente aprovação/);
    assert.match(html, /aria-controls="orders-panel"/);
    assert.match(html, /role="tab"[^>]*>Pendente execução/);
    assert.match(html, /role="tab"[^>]*>Concluído/);
    assert.match(html, /role="tab"[^>]*>Cancelados/);
    assert.equal((html.match(/role="tab"/g) || []).length, 4);
    assert.match(html, /id="orders-panel"[^>]*role="tabpanel"/);
  } finally {
    await server.close();
  }
});
