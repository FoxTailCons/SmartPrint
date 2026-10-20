import test from 'node:test';
import assert from 'node:assert/strict';
import * as exports from './exportDownload.js';

test('export URL always includes the complete date range', () => {
  assert.equal(typeof exports.buildExportDownloadPath, 'function');
  assert.equal(
    exports.buildExportDownloadPath('orders', '2026-10-01', '2026-10-20'),
    '/api/exports/orders?from=2026-10-01&to=2026-10-20',
  );
});

test('export URL rejects missing or invalid date values and unknown export types', () => {
  assert.throws(() => exports.buildExportDownloadPath('finance', '', '2026-10-20'));
  assert.throws(() => exports.buildExportDownloadPath('finance', '2026-02-30', '2026-10-20'));
  assert.throws(() => exports.buildExportDownloadPath('finance', '2026-10-20', '2026-10-01'));
  assert.throws(() => exports.buildExportDownloadPath('other', '2026-10-01', '2026-10-20'));
});
