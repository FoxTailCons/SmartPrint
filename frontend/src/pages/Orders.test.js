import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('orders page groups active quotes/orders and completed/canceled records', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { default: Orders } = await server.ssrLoadModule('/src/pages/Orders.jsx');
    const html = renderToString(React.createElement(StaticRouter, { location: '/pedidos' }, React.createElement(Orders)));

    assert.match(html, /role="tablist"/);
    assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>Orçamentos\/Pedidos/);
    assert.match(html, /aria-controls="orders-panel"/);
    assert.match(html, /role="tab"[^>]*>Concluídos\/Cancelados/);
    assert.equal((html.match(/role="tab"/g) || []).length, 2);
    assert.match(html, /id="orders-panel"[^>]*role="tabpanel"/);
    assert.match(html, /Data de entrega/);
    assert.match(html, /A PAGAR/);
    assert.match(html, />TOTAL</);
    assert.match(html, /responsive-table/);
    const columnWidths = [...html.matchAll(/<col style="width:(\d+)%"/g)].map(([, width]) => Number.parseInt(width, 10));
    assert.deepEqual(columnWidths, [7, 9, 8, 24, 7, 8, 8, 8, 8, 13]);
    assert.equal(columnWidths.reduce((total, width) => total + width, 0), 100);
  } finally {
    await server.close();
  }
});

test('production status badge disappears after production starts but remains before start', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { ProductionStatus } = await server.ssrLoadModule('/src/pages/Orders.jsx');
    const started = renderToString(React.createElement(ProductionStatus, { value: 'em_producao' }));
    const notStarted = renderToString(React.createElement(ProductionStatus, { value: 'nao_iniciado' }));
    const paused = renderToString(React.createElement(ProductionStatus, { value: 'pausado' }));

    assert.doesNotMatch(started, /Não iniciado|Em produção/);
    assert.match(notStarted, /Não iniciado/);
    assert.match(paused, /Pausado/);
  } finally {
    await server.close();
  }
});

test('orders list stage tracker distinguishes completed, skipped, current and upcoming stages', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { ProductionStageTracker } = await server.ssrLoadModule('/src/pages/Orders.jsx');
    const html = renderToString(React.createElement(StaticRouter, { location: '/pedidos' },
      React.createElement(ProductionStageTracker, {
        order: {
          status: 'aprovado',
          productionStage: 'impressao',
          skippedStages: ['aprovacao_cliente'],
        },
        onAdvance() {},
      })));

    assert.match(html, /role="progressbar"/);
    assert.match(html, /aria-valuenow="1"/);
    assert.match(html, /aria-valuemax="4"/);
    assert.match(html, /1 de 4 etapas concluídas; etapa atual: Impressão/);
    assert.match(html, /Arte: concluída/);
    assert.match(html, /Impressão: atual/);
    assert.match(html, /Acabamento: pendente/);
    assert.match(html, /Entregue: pendente/);
    assert.match(html, /aria-label="Avançar para Acabamento"[^>]*>Acabamento/);
    assert.match(html, /bg-amber-100 font-semibold text-amber-900/);
    assert.match(html, /<button type="button" disabled="" aria-label="Avançar para Entregue"/);
  } finally {
    await server.close();
  }
});

test('completed orders show all required production stages completed', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { ProductionStageTracker } = await server.ssrLoadModule('/src/pages/Orders.jsx');
    const html = renderToString(React.createElement(StaticRouter, { location: '/pedidos' },
      React.createElement(ProductionStageTracker, {
        order: {
          status: 'concluido',
          production: 'concluido',
          productionStage: 'entregue',
          skippedStages: ['aprovacao_cliente'],
        },
      })));

    assert.match(html, /aria-valuenow="4"/);
    assert.match(html, /aria-valuemax="4"/);
    assert.match(html, /4 de 4 etapas concluídas; pedido entregue/);
    assert.match(html, /Arte: concluída/);
    assert.match(html, /Impressão: concluída/);
    assert.match(html, /Acabamento: concluída/);
    assert.match(html, /Entregue: concluída/);
  } finally {
    await server.close();
  }
});
