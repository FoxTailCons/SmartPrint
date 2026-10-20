import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

test('role guard withholds protected content and explains the access denial', async () => {
  const server = await createServer({
    server: { middlewareMode: true, ws: false },
  });
  try {
    const { default: RoleGuard } = await server.ssrLoadModule('/src/components/RoleGuard.jsx');
    const html = renderToString(React.createElement(RoleGuard, {
      role: 'atendente',
      permission: 'dashboard',
      children: React.createElement('span', null, 'DRE confidencial'),
    }));
    assert.match(html, /Seu perfil não tem permissão para acessar esta tela/);
    assert.doesNotMatch(html, /DRE confidencial/);
  } finally {
    await server.close();
  }
});
