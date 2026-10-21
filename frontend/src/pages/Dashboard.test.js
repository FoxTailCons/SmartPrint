import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

test('dashboard sections start expanded and expose a native disclosure control', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { DashboardSection } = await server.ssrLoadModule('/src/pages/Dashboard.jsx');
    const html = renderToString(React.createElement(DashboardSection, {
      title: 'Resumo financeiro',
      description: 'Dados do período',
    }, React.createElement('p', null, 'Conteúdo do quadro')));

    assert.match(html, /<details open="" class=/);
    assert.match(html, /<summary[^>]*>/);
    assert.match(html, /Resumo financeiro/);
    assert.match(html, /Dados do período/);
    assert.match(html, /Conteúdo do quadro/);
  } finally {
    await server.close();
  }
});
