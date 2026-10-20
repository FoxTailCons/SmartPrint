import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

test('pagination exposes a page-size selector with the current size selected', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { default: Pagination } = await server.ssrLoadModule('/src/components/Pagination.jsx');
    const html = renderToString(React.createElement(Pagination, {
      page: 1,
      pageSize: 20,
      total: 35,
      onPageChange() {},
      onPageSizeChange() {},
    }));

    assert.match(html, /aria-label="Itens por página"/);
    assert.match(html, /<option value="10">10<\/option>/);
    assert.match(html, /<option value="20" selected="">20<\/option>/);
    assert.match(html, /<option value="50">50<\/option>/);
    assert.match(html, /<option value="100">100<\/option>/);
  } finally {
    await server.close();
  }
});
