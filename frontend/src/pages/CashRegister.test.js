import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('cash movement forms label and submit their own movement type', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { CashMovementForm } = await server.ssrLoadModule('/src/pages/CashRegister.jsx');
    const html = renderToString(React.createElement(StaticRouter, { location: '/caixa' },
      React.createElement(React.Fragment, null,
        React.createElement(CashMovementForm, {
          title: 'Sangria',
          path: 'withdrawals',
          movement: { amount: '', note: '' },
          setMovement() {},
          submit() {},
        }),
        React.createElement(CashMovementForm, {
          title: 'Suprimento',
          path: 'supply',
          movement: { amount: '', note: '' },
          setMovement() {},
          submit() {},
        }))));
    assert.match(html, /Registrar.*sangria/);
    assert.match(html, /Registrar.*suprimento/);
  } finally {
    await server.close();
  }
});
