import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('quick sale confirmation uses server total and existing payment receipt', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { QuickSaleResult } = await server.ssrLoadModule('/src/pages/QuickOrder.jsx');
    const order = { _id: 'sale-1', number: 12, finalValue: 17, payments: [{ amount: 17, method: 'pix', paidAt: '2026-10-20T15:00:00Z' }] };
    const html = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/pedido-rapido' }, React.createElement(QuickSaleResult, { order, onNewSale() {} })));
    assert.match(html, /17,00/);
    assert.match(html, /href="\/pedidos\/sale-1"/);
    assert.match(html, /Imprimir recibo/);
    assert.match(html, /Venda concluída/);
    assert.match(html, /Nova venda/);
  } finally { await server.close(); }
});
