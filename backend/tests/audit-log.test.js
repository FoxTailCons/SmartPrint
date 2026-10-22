import test from 'node:test';
import assert from 'node:assert/strict';
import AuditLog from '../models/AuditLog.js';
import { auditActions, buildAuditRecord, parseAuditFilters, recordAuditEvent } from '../services/auditLog.js';

test('audit records contain explicit business data and never copy request credentials', async () => {
  let saved;
  const AuditLogModel = {
    async create(record) {
      saved = record;
      return record;
    },
  };
  const req = {
    ip: '192.0.2.10',
    body: { password: 'secret', adminAuthorization: { password: 'admin-secret' } },
    headers: { authorization: 'Bearer private-token' },
    user: { _id: 'requester-id', name: 'Ana' },
  };

  await recordAuditEvent({
    AuditLogModel,
    req,
    action: 'produto.preco_custo_alterado',
    details: {
      productId: 'product-id',
      price: { before: 10, after: 12 },
      password: 'secret-in-details',
      nested: { credential: 'private-credential' },
    },
    authorizedBy: { _id: 'admin-id' },
  });

  assert.deepEqual(saved, {
    data: saved.data,
    usuarioSolicitante: 'requester-id',
    usuarioAutorizou: 'admin-id',
    acao: 'produto.preco_custo_alterado',
    detalhes: { productId: 'product-id', price: { before: 10, after: 12 }, nested: {} },
    ip: '192.0.2.10',
    sucesso: true,
  });
  assert.equal(JSON.stringify(saved).includes('secret'), false);
  assert.equal(JSON.stringify(saved).includes('private-token'), false);
  assert.ok(saved.data instanceof Date);
  assert.ok(AuditLog.schema.indexes().some(([fields]) => fields.data === -1));
  assert.equal(AuditLog.schema.path('data').options.immutable, true);
  assert.deepEqual(Object.keys(buildAuditRecord({ req: {}, action: 'auth.login', success: false })), [
    'data', 'usuarioSolicitante', 'usuarioAutorizou', 'acao', 'detalhes', 'ip', 'sucesso',
  ]);
});

test('audit filters validate user, action, date interval, and bounded pagination', () => {
  const filters = parseAuditFilters({
    usuarioSolicitante: '507f1f77bcf86cd799439011',
    acao: 'caixa.fechamento',
    de: '2026-01-01',
    ate: '2026-12-31',
    page: '2',
    pageSize: '50',
  });

  test('payment estornos are accepted as audit events', () => {
    assert.ok(auditActions.includes('pagamento.estornado'));
    assert.equal(buildAuditRecord({ req: {}, action: 'pagamento.estornado' }).acao, 'pagamento.estornado');
  });

  assert.deepEqual(filters.filter, {
    usuarioSolicitante: '507f1f77bcf86cd799439011',
    acao: 'caixa.fechamento',
    data: { $gte: new Date('2026-01-01T03:00:00.000Z'), $lt: new Date('2027-01-01T03:00:00.000Z') },
  });
  assert.deepEqual(filters.pagination, { page: 2, pageSize: 50, skip: 50 });
  for (const query of [
    { usuarioSolicitante: 'not-an-id' },
    { acao: 'desconhecida' },
    { de: '2026-02-30', ate: '2026-03-01' },
    { de: '2025-01-01', ate: '2026-01-02' },
    { de: '2026-01-02' },
  ]) {
    assert.throws(() => parseAuditFilters(query), (error) => error.statusCode === 400);
  }
});
