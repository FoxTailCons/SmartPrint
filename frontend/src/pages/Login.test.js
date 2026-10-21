import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

for (const production of [true, false]) {
  test(`login ${production ? 'hides' : 'offers'} demo access in ${production ? 'production' : 'development'}`, async () => {
    const server = await createServer({
      server: { middlewareMode: true, ws: false },
      define: { 'import.meta.env.PROD': JSON.stringify(production) },
    });
    try {
      const { default: Login } = await server.ssrLoadModule('/src/pages/Login.jsx');
      const { AuthProvider } = await server.ssrLoadModule('/src/context/AuthContext.jsx');
      const html = renderToString(React.createElement(StaticRouter, { location: '/login' },
        React.createElement(AuthProvider, null, React.createElement(Login))));

      assert.equal(html.includes('Acesso rápido'), !production);
      assert.equal(html.includes('admin'), !production);
      assert.equal(html.includes('admin123'), !production);
      if (production) {
        assert.match(html, /type="text"[^>]*value=""/);
        assert.match(html, /Nome de usuário ou e-mail/);
        assert.match(html, /type="password"[^>]*value=""/);
      }
    } finally {
      await server.close();
    }
  });
}
