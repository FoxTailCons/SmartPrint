import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('audit page is protected for Admin and exposes the requested filters and columns', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { default: AuditLog } = await server.ssrLoadModule('/src/pages/AuditLog.jsx');
    const { default: RoleGuard } = await server.ssrLoadModule('/src/components/RoleGuard.jsx');
    const render = (role) => renderToString(React.createElement(StaticRouter, { location: '/auditoria' },
      React.createElement(RoleGuard, { role, permission: 'audit' }, React.createElement(AuditLog))));

    const adminHtml = render('admin');
    assert.match(adminHtml, /Histórico de ações administrativas/);
    assert.match(adminHtml, /Usuário/);
    assert.match(adminHtml, /De/);
    assert.match(adminHtml, /Até/);
    assert.match(adminHtml, /Resultado/);
    assert.match(render('atendente'), /Seu perfil não tem permissão/);
    assert.match(render('producao'), /Seu perfil não tem permissão/);
  } finally {
    await server.close();
  }
});
