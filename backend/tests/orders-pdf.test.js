import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildOrderPdfBuffer } from '../routes/orders.js';

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
