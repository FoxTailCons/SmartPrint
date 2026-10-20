import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

test('product selector contains its search field inside the combobox dropdown', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { default: ProductCombobox } = await server.ssrLoadModule('/src/components/ProductCombobox.jsx');
    const html = renderToString(React.createElement(ProductCombobox, {
      products: [{ _id: '1', name: 'Cópia A4', saleUnit: 'unit', active: true }],
      value: '',
      onChange() {},
      query: '',
      onQueryChange() {},
    }));

    assert.match(html, /role="combobox"/);
    assert.match(html, /aria-label="Buscar produto"/);
    assert.match(html, /placeholder="Buscar por nome ou código\.\.\."/);
    assert.match(html, /role="listbox"/);
    assert.match(html, /Cópia A4/);
  } finally {
    await server.close();
  }
});

test('product selector gives an explicit empty state when there are no eligible products', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { default: ProductCombobox } = await server.ssrLoadModule('/src/components/ProductCombobox.jsx');
    const html = renderToString(React.createElement(ProductCombobox, {
      products: [],
      value: '',
      onChange() {},
      query: '',
      onQueryChange() {},
    }));

    assert.match(html, /role="combobox"/);
    assert.match(html, /Nenhum produto ativo por unidade disponível/);
  } finally {
    await server.close();
  }
});
