import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('production stages render as independently expandable panels with order counts', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { ProductionStagePanel } = await server.ssrLoadModule('/src/pages/Production.jsx');
    const order = {
      _id: 'order-1',
      number: 42,
      status: 'aprovado',
      production: 'em_producao',
      productionStage: 'arte',
      deliveryDate: '2026-10-25',
      priority: 'normal',
      client: { name: 'Cliente' },
      items: [{ description: 'Banner' }],
    };
    const html = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/producao' },
      React.createElement(ProductionStagePanel, {
        stage: 'arte',
        title: 'Arte',
        orders: [order],
        user: { role: 'producao' },
        onChanged() {},
      })));

    assert.match(html, /<details/);
    assert.doesNotMatch(html, /<details[^>]* open/);
    assert.match(html, /Arte/);
    assert.match(html, /1 pedido\(s\)/);
    assert.match(html, /#42 · Cliente/);
    assert.match(html, /Banner/);
    assert.match(html, /Não alocado/);
    assert.match(html, /Somente o responsável alocado/);
    assert.doesNotMatch(html, /Concluir arte/);
  } finally {
    await server.close();
  }
});

test('production task cards let Admin allocate and operate assigned tasks', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { ProductionStagePanel } = await server.ssrLoadModule('/src/pages/Production.jsx');
    const order = {
      _id: 'order-2',
      number: 43,
      status: 'aprovado',
      production: 'nao_iniciado',
      productionStage: 'arte',
      priority: 'normal',
      client: { name: 'Cliente' },
      items: [{ description: 'Cartão' }],
    };
    const html = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/producao' },
      React.createElement(ProductionStagePanel, {
        stage: 'arte',
        title: 'Arte',
        orders: [order],
        user: { _id: 'admin', role: 'admin' },
        users: [{ _id: 'worker-1', name: 'Profissional', role: 'producao' }],
        onChanged() {},
      })));

    assert.match(html, /Profissional · Produção/);
    assert.match(html, /Alocar/);
    assert.match(html, /Iniciar arte/);
  } finally {
    await server.close();
  }
});
