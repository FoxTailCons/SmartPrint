import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('user administration is visible only to Admin', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { default: Users } = await server.ssrLoadModule('/src/pages/Users.jsx');
    const { default: RoleGuard } = await server.ssrLoadModule('/src/components/RoleGuard.jsx');
    const render = (role) => renderToString(React.createElement(StaticRouter, { location: '/usuarios' },
      React.createElement(RoleGuard, { role, permission: 'users' }, React.createElement(Users))));

    const adminHtml = render('admin');
    assert.match(adminHtml, /Novo usuário/);
    assert.match(adminHtml, /E-mail \(opcional\)/);
    assert.match(adminHtml, /type="email" autoComplete="email"/);
    assert.match(adminHtml, /Senha inicial \(exatamente 6 caracteres\)/);
    assert.match(adminHtml, /minLength="6" maxLength="6"/);
    assert.match(adminHtml, /Atendente/);
    assert.match(adminHtml, /Produção/);
    for (const role of ['atendente', 'producao']) {
      assert.match(render(role), /Seu perfil não tem permissão/);
    }
  } finally {
    await server.close();
  }
});

test('editing a user omits the optional password when it is blank', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { buildUserUpdatePayload, buildAdminIdentityPayload } = await server.ssrLoadModule('/src/pages/Users.jsx');
    assert.deepEqual(buildUserUpdatePayload({
      name: ' Ana Maria ',
      username: ' Ana.Maria ',
      email: ' ANA@EXAMPLE.COM ',
      role: 'producao',
      password: '',
    }), {
      name: 'Ana Maria',
      username: 'ana.maria',
      email: 'ana@example.com',
      role: 'producao',
    });
    assert.deepEqual(buildAdminIdentityPayload({
      username: ' Admin.Novo ',
      email: ' ADMIN.NOVO@EXAMPLE.COM ',
    }), {
      username: 'admin.novo',
      email: 'admin.novo@example.com',
    });
  } finally {
    await server.close();
  }
});
