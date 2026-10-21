import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarDays,
  getSaoPauloDateKey,
  getSaoPauloDayRange,
  isValidDateKey,
} from '../services/calendarDate.js';
import { nextMonthlyDate } from '../routes/payables.js';

test('calendar dates use Sao Paulo business days independent of UTC boundaries', () => {
  assert.equal(getSaoPauloDateKey(new Date('2026-10-20T02:59:00.000Z')), '2026-10-19');
  assert.equal(getSaoPauloDateKey(new Date('2026-10-20T03:00:00.000Z')), '2026-10-20');
  assert.deepEqual(getSaoPauloDayRange('2026-10-20'), {
    start: new Date('2026-10-20T03:00:00.000Z'),
    end: new Date('2026-10-21T03:00:00.000Z'),
  });
});

test('calendar day arithmetic validates and handles month and year boundaries', () => {
  assert.equal(addCalendarDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addCalendarDays('2026-12-31', 1), '2027-01-01');
  assert.equal(isValidDateKey('2024-02-29'), true);
  assert.equal(isValidDateKey('2026-02-29'), false);
});

test('monthly payable recurrence stays on the intended civil day around short months', () => {
  assert.equal(nextMonthlyDate(new Date('2026-01-31T00:00:00.000Z')).toISOString(), '2026-02-28T00:00:00.000Z');
});
