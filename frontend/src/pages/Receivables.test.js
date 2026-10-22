import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('receivables groups print formats in one selector and only offers balance print when due', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { ReceivablePrintActions, printReceivableFormat } = await server.ssrLoadModule('/src/pages/Receivables.jsx');
    const withBalance = renderToString(React.createElement(ReceivablePrintActions, {
      order: { _id: 'order-1', number: '00001', balance: 45, finalValue: 100, amountPaid: 55 },
    }));
    const paid = renderToString(React.createElement(ReceivablePrintActions, {
      order: { _id: 'order-2', number: '00002', balance: 0, finalValue: 100, amountPaid: 100 },
    }));

    assert.match(withBalance, /Tipo de impressão do pedido .*00001/);
    assert.match(withBalance, /<option value="" selected="">Impressões<\/option>/);
    assert.match(withBalance, /<option value="a4">Pedido A4<\/option>/);
    assert.match(withBalance, /Pedido 80 mm/);
    assert.match(withBalance, /Pendência 80 mm/);
    assert.doesNotMatch(withBalance, /Imprimir<\/button>/);
    assert.doesNotMatch(paid, /Imprimir<\/button>/);
    assert.doesNotMatch(paid, /Pendência 80 mm/);

    const printCalls = [];
    const balanceCalls = [];
    printReceivableFormat({ _id: 'order-1', balance: 45 }, 'a4', (...args) => printCalls.push(args), (html) => balanceCalls.push(html));
    printReceivableFormat({ _id: 'order-1', balance: 45 }, '80mm', (...args) => printCalls.push(args), (html) => balanceCalls.push(html));
    printReceivableFormat({ _id: 'order-1', balance: 45 }, 'balance', (...args) => printCalls.push(args), (html) => balanceCalls.push(html));
    printReceivableFormat({ _id: 'order-1', balance: 45 }, '', (...args) => printCalls.push(args), (html) => balanceCalls.push(html));
    assert.deepEqual(printCalls, [['order-1', 'a4'], ['order-1', '80mm']]);
    assert.equal(balanceCalls.length, 1);
    assert.match(balanceCalls[0], /PENDÊNCIA/);
  } finally {
    await server.close();
  }
});

test('receivables table centers every column heading', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const [{ default: Receivables }, { AuthProvider }] = await Promise.all([
      server.ssrLoadModule('/src/pages/Receivables.jsx'),
      server.ssrLoadModule('/src/context/AuthContext.jsx'),
    ]);
    const html = renderToString(React.createElement(StaticRouter, { location: '/contas-receber' },
      React.createElement(AuthProvider, null, React.createElement(Receivables))));
    const headers = [...html.matchAll(/<th class="([^"]+)"/g)].map(([, className]) => className);

    assert.equal(headers.length, 7);
    assert.ok(headers.every((className) => className.includes('text-center')));
  } finally {
    await server.close();
  }
});
