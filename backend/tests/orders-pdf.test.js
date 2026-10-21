import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildOrderDocumentLabel, buildOrderPdfBuffer, canReceivePayments, initializeNewOrder } from '../routes/orders.js';
import { normalizeOrderAttachments, buildWhatsappText } from '../routes/orders.js';

test('paid orders keep the Pedido title instead of becoming receipts', () => {
  assert.equal(buildOrderDocumentLabel({ amountPaid: 25 }), 'Pedido');
});

test('approved orders are labeled Pedido before their first payment', () => {
  assert.equal(buildOrderDocumentLabel({ status: 'aprovado', amountPaid: 0 }), 'Pedido');
});

test('pending unpaid orders keep the Orçamento title', () => {
  assert.equal(buildOrderDocumentLabel({ status: 'pendente', amountPaid: 0 }), 'Orçamento');
});

test('legacy pending orders with payments keep the Pedido title', () => {
  assert.equal(buildOrderDocumentLabel({ status: 'pendente', amountPaid: 25 }), 'Pedido');
});

test('new payments are only allowed after order approval', () => {
  assert.equal(canReceivePayments({ status: 'pendente' }), false);
  assert.equal(canReceivePayments({ status: 'aprovado' }), true);
  assert.equal(canReceivePayments({ status: 'concluido' }), true);
});

test('quick orders without a client are approved immediately and record a configured entry once', () => {
  const order = {
    client: null,
    status: 'pendente',
    downPayment: 5,
    amountPaid: 0,
    finalValue: 11,
    paymentMethod: 'pix',
    payments: [],
    installments: [],
    history: [],
  };

  initializeNewOrder(order, { quickOrder: true, userName: 'Atendente' });

  assert.equal(order.status, 'aprovado');
  assert.equal(order.client, null);
  assert.equal(order.amountPaid, 5);
  assert.equal(order.payments.length, 1);
  assert.equal(order.payments[0].type, 'entrada');
  assert.deepEqual(order.history.map(({ action }) => action), ['criado', 'aprovado', 'pagamento']);
});

test('regular orders stay pending when initialized without quick-order mode', () => {
  const order = { status: 'pendente', history: [] };

  initializeNewOrder(order, { userName: 'Atendente' });

  assert.equal(order.status, 'pendente');
  assert.deepEqual(order.history.map(({ action }) => action), ['criado']);
});

test('buildOrderPdfBuffer should return a PDF buffer for a valid order', async () => {
  const order = {
    number: '00042',
    client: { name: 'Maria Silva', phone: '(11) 99999-9999' },
    items: [
      { description: 'Banner 1x2m', quantity: 2, unitPrice: 120, total: 240 },
      { description: 'Adesivo 20cm', quantity: 10, unitPrice: 8, total: 80 },
    ],
    totalValue: 320,
    discount: 20,
    finalValue: 300,
    paymentMethod: 'pix',
    observations: 'Entrega em 3 dias',
    createdAt: new Date('2026-01-15T12:00:00Z'),
    deliveryDate: new Date('2026-01-18T12:00:00Z'),
    status: 'pendente',
    paymentStatus: 'aberto',
  };

  const buffer = await buildOrderPdfBuffer(order);

  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 1000);
  assert.match(buffer.toString('latin1'), /PDF/);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartprint-pdf-'));
  const filePath = path.join(tmpDir, 'test-order.pdf');
  fs.writeFileSync(filePath, buffer);
  assert.ok(fs.existsSync(filePath));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
import zlib from 'node:zlib';
const pdfStreams = (buffer) => [...buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
  try { return zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { return ''; }
});
const pdfText = (buffer) => pdfStreams(buffer)
  .flatMap((stream) => [...stream.matchAll(/<([0-9a-f]+)>/gi)].map((match) => Buffer.from(match[1], 'hex').toString('latin1')))
  .join('');

test('quote PDF includes validity and configured commercial details with conditional PIX', async () => {
  const settings = {
    quoteValidityDays: 7, businessAddress: 'Rua Exemplo 10', businessPhone: '51999999999',
    businessPixKey: 'pix@example.org', businessInstagram: '@smartprint.lindoia',
  };
  const order = {
    number: 'Q-10', createdAt: '2026-10-20T15:00:00Z', status: 'pendente', amountPaid: 0,
    paymentMethod: 'pix', items: [{ description: 'Banner', quantity: 1, unitPrice: 100, total: 100 }],
    totalValue: 100, finalValue: 100,
  };
  const quoteText = pdfText(await buildOrderPdfBuffer(order, settings));
  assert.match(quoteText, /27\/10\/2026/);
  assert.match(quoteText, /Rua Exemplo 10/);
  assert.match(quoteText, /51999999999/);
  assert.match(quoteText, /@smartprint\.lindoia/);
  assert.match(quoteText, /pix@example\.org/);

  const approvedText = pdfText(await buildOrderPdfBuffer({ ...order, status: 'aprovado', paymentMethod: 'dinheiro' }, settings));
  assert.doesNotMatch(approvedText, /27\/10\/2026/);
  assert.doesNotMatch(approvedText, /pix@example\.org/);
});
test('order PDF includes Smart Print Lindóia company registration and contact details', async () => {
  const text = pdfText(await buildOrderPdfBuffer({
    number: 'DOC-80',
    items: [{ description: 'Banner', quantity: 1, unitPrice: 100, total: 100 }],
    totalValue: 100,
    finalValue: 100,
  }));

  for (const detail of [
    'CNPJ: 30.792.498/0001-33',
    'Rua Doutor Francisco Tozzi, 235',
    'Jardim Redentor',
    'Lindóia-SP',
    'CEP: 13958-040',
    '(19) 99803-1407',
  ]) assert.ok(text.includes(detail), `PDF should include ${detail}`);
});
test('rich items paginate with repeated table headers and complete metadata', async () => {
  const order = { number: 'MANY', items: Array.from({ length: 14 }, (_, index) => ({ description: `Banner ${index}`, quantity: 2, unitPrice: 10, total: 20, serviceName: 'Impressao', material: 'Vinil', finishing: 'Laminado', applicationLocation: 'Fachada', promisedDate: '2026-10-20', artworkUrl: `https://example.org/${'arte'.repeat(80)}`, installationNotes: `Nota${index} ${'detalhes de instalacao '.repeat(30)}` })), finalValue: 280, observations: 'Observacoes finais' };
  const buffer = await buildOrderPdfBuffer(order);
  const pageCount = [...buffer.toString('latin1').matchAll(/\/Type \/Page\b/g)].length;
  const streams = pdfStreams(buffer).filter(stream => stream.includes('BT'));
  const decoded = streams.map(stream => [...stream.matchAll(/<([0-9a-f]+)>/gi)].map(match => Buffer.from(match[1], 'hex').toString('latin1')).join(''));
  const headerPages = decoded.filter(text => text.includes('Produto')).length;
  assert.ok(pageCount > 1);
  assert.ok(headerPages > 1, 'each continued item page must repeat the table header');
  assert.ok(decoded.some(text => text.includes('Nota13')), 'last metadata must remain in PDF');
  assert.ok(streams.every(stream => !/1 0 0 1 [\d.]+ -[\d.]+ Tm/.test(stream)), 'text coordinates must remain above the page bottom');
});
test('single huge item and long observations paginate without losing their tails', async () => {
  const buffer = await buildOrderPdfBuffer({ number: 'LONG', items: [{ description: 'Banner', quantity: 1, unitPrice: 10, installationNotes: 'Detalhes '.repeat(1500) + 'FIMITEM' }], observations: 'Observacoes '.repeat(1500) + 'FIMOBS' });
  const streams = pdfStreams(buffer).join('\n').toLowerCase();
  for (const marker of ['FIMITEM', 'FIMOBS']) assert.ok(streams.includes(Buffer.from(marker).toString('hex')), marker);
  assert.ok(!/1 0 0 1 [\d.]+ -[\d.]+ tm/.test(streams));
});

test('order attachments validate links and appear in WhatsApp and PDF documents', async () => {
  const attachments = normalizeOrderAttachments([{ label: 'Foto fachada', url: 'https://files.example/fachada.jpg' }]);
  assert.deepEqual(attachments, [{ label: 'Foto fachada', url: 'https://files.example/fachada.jpg' }]);
  assert.throws(() => normalizeOrderAttachments([{ label: 'Foto', url: 'javascript:alert(1)' }]), /HTTP ou HTTPS/);
  const order = {
    number: 'ATT-1', createdAt: '2026-10-20T15:00:00Z', status: 'pendente',
    items: [{ description: 'Fachada', quantity: 1, unitPrice: 100, total: 100 }],
    totalValue: 100, finalValue: 100, attachments,
  };
  assert.match(buildWhatsappText(order, {}), /Anexo — Foto fachada: https:\/\/files\.example\/fachada\.jpg/);
  const text = pdfText(await buildOrderPdfBuffer(order));
  assert.match(text, /Foto fachada/);
  assert.match(text, /files\.example\/fachada\.jpg/);
});
