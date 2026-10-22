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
    assert.deepEqual(columnWidths, [7, 9, 8, 24, 7, 5, 8, 8, 8, 16]);
    assert.equal(columnWidths.reduce((total, width) => total + width, 0), 100);
    const headers = [...html.matchAll(/<th class="([^"]+)"/g)].map(([, className]) => className);
    assert.equal(headers.length, 10);
    assert.ok(headers.every((className) => className.includes('text-center')));
  } finally {
    await server.close();
  }
});

test('order actions use a compact 2x2 grid with icon-only accessible WhatsApp control', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { OrderActions } = await server.ssrLoadModule('/src/pages/Orders.jsx');
    const html = renderToString(React.createElement(StaticRouter, { location: '/pedidos' },
      React.createElement(OrderActions, { order: { _id: 'order-1', number: '00001', status: 'aprovado' } })));

    assert.match(html, /grid-cols-2/);
    assert.match(html, /aria-label="Enviar pedido pelo WhatsApp"/);
    assert.match(html, />A4</);
    assert.match(html, />80 mm</);
    assert.match(html, />Abrir</);
    assert.doesNotMatch(html, /WhatsApp<\/button>/);
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
    const startedWithTimestamp = renderToString(React.createElement(ProductionStatus, {
      value: 'nao_iniciado',
      order: { productionStartedAt: '2026-10-22T10:00:00.000Z' },
    }));
    const advancedStage = renderToString(React.createElement(ProductionStatus, {
      value: 'nao_iniciado',
      order: { productionStage: 'impressao' },
    }));
    const firstApplicableStage = renderToString(React.createElement(ProductionStatus, {
      value: 'nao_iniciado',
      order: { productionStage: 'impressao', skippedStages: ['arte'] },
    }));
    const completedFirstStage = renderToString(React.createElement(ProductionStatus, {
      value: 'nao_iniciado',
      order: {
        productionStage: 'impressao',
        skippedStages: ['arte'],
        history: [{ action: 'etapa_concluida', fromStage: 'arte', toStage: 'impressao' }],
      },
    }));
    const paused = renderToString(React.createElement(ProductionStatus, { value: 'pausado' }));

    assert.doesNotMatch(started, /Não iniciado|Em produção/);
    assert.match(notStarted, /Não iniciado/);
    assert.doesNotMatch(startedWithTimestamp, /Não iniciado/);
    assert.doesNotMatch(advancedStage, /Não iniciado/);
    assert.match(firstApplicableStage, /Não iniciado/);
    assert.doesNotMatch(completedFirstStage, /Não iniciado/);
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
