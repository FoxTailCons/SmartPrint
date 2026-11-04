import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('proposal item fields use a responsive grid without compressing narrow-screen inputs', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { default: ProposalForm } = await server.ssrLoadModule('/src/pages/ProposalForm.jsx');
    const html = renderToString(
      React.createElement(StaticRouter, { location: '/propostas/nova' },
        React.createElement(ProposalForm)),
    );

    assert.match(html, /grid grid-cols-2 items-center gap-2 xl:grid-cols-12/);
    assert.match(html, /col-span-2 min-w-0 rounded-lg border px-3 py-2 text-sm xl:col-span-6/);
  } finally {
    await server.close();
  }
});
