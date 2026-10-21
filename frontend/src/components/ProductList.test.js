import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

test('product list renders one shared pagination control, not one per item', async () => {
  const server = await createServer({
    server: { middlewareMode: true, ws: false },
  });
  try {
    const { default: ProductList } = await server.ssrLoadModule('/src/components/ProductList.jsx');
    const products = [
      { _id: '1', name: 'Cópia A4', saleUnit: 'unit', price: 1, active: true },
      { _id: '2', name: 'Banner', saleUnit: 'square_meter', price: 30, active: true },
    ];
    const html = renderToString(React.createElement(ProductList, {
      products,
      isAdmin: false,
      page: 1,
      pageSize: 20,
      total: 21,
      onPageChange() {},
      onEdit() {},
      onToggleActive() {},
    }));

    assert.equal((html.match(/aria-label="Paginação da lista"/g) || []).length, 1);
    assert.ok(html.indexOf('aria-label="Paginação da lista"') < html.indexOf('Cópia A4'));
    assert.match(html, /Cópia A4/);
    assert.match(html, /Banner/);
  } finally {
    await server.close();
  }
});
