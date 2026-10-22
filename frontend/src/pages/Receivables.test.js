import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

test('receivables groups print formats in one selector and only offers balance print when due', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { ReceivablePrintActions } = await server.ssrLoadModule('/src/pages/Receivables.jsx');
    const withBalance = renderToString(React.createElement(ReceivablePrintActions, {
      order: { _id: 'order-1', number: '00001', balance: 45, finalValue: 100, amountPaid: 55 },
    }));
    const paid = renderToString(React.createElement(ReceivablePrintActions, {
      order: { _id: 'order-2', number: '00002', balance: 0, finalValue: 100, amountPaid: 100 },
    }));

    assert.match(withBalance, /Tipo de impressão do pedido .*00001/);
    assert.match(withBalance, /<option value="a4" selected="">Pedido A4<\/option>/);
    assert.match(withBalance, /Pedido 80 mm/);
    assert.match(withBalance, /Pendência 80 mm/);
    assert.equal((withBalance.match(/<button /g) || []).length, 1);
    assert.equal((paid.match(/<button /g) || []).length, 1);
    assert.doesNotMatch(paid, /Pendência 80 mm/);
  } finally {
    await server.close();
  }
});
