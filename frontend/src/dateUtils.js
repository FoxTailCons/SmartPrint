const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})/;
const timeZone = 'America/Sao_Paulo';

export const calendarDate = (value) => {
  if (!value) return '';
  const match = typeof value === 'string' ? value.match(dateKeyPattern) : null;
  if (match) {
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[0] ? match[0] : '';
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
};

export const formatCivilDate = (value) => {
  const dateKey = calendarDate(value);
  if (!dateKey) return '—';
  const [, year, month, day] = dateKey.match(dateKeyPattern);
  return `${day}/${month}/${year}`;
};

export const formatInstantDate = (value) => new Date(value).toLocaleDateString('pt-BR', { timeZone });

export const formatInstantTime = (value) => new Date(value).toLocaleTimeString('pt-BR', {
  timeZone,
  hour: '2-digit',
  minute: '2-digit',
});

export const formatInstantDateTime = (value) => new Date(value).toLocaleString('pt-BR', { timeZone });

export const getSaoPauloDateKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date);

export const addCalendarMonths = (dateKey, months) => {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const targetMonth = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  return `${targetMonth.getUTCFullYear()}-${String(targetMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
};
