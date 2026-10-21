import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarMonths,
  calendarDate,
  formatCivilDate,
  formatInstantDate,
  getSaoPauloDateKey,
} from './dateUtils.js';

test('civil dates are displayed without timezone shifts', () => {
  assert.equal(calendarDate('2026-10-21T00:00:00.000Z'), '2026-10-21');
  assert.equal(calendarDate(new Date('2026-10-21T00:00:00.000Z')), '2026-10-21');
  assert.equal(formatCivilDate('2026-10-21T00:00:00.000Z'), '21/10/2026');
  assert.equal(formatCivilDate('2026-02-30'), '—');
});

test('civil monthly installments clamp month ends and anchor each date to the original day', () => {
  assert.equal(addCalendarMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addCalendarMonths('2026-01-31', 2), '2026-03-31');
  assert.equal(addCalendarMonths('2024-01-31', 1), '2024-02-29');
});

test('instant formatting and today use the Sao Paulo timezone', () => {
  assert.equal(formatInstantDate('2026-10-20T02:59:00.000Z'), '19/10/2026');
  assert.equal(getSaoPauloDateKey(new Date('2026-10-20T02:59:00.000Z')), '2026-10-19');
});
