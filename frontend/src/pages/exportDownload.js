const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const isCivilDate = (value) => {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const buildExportDownloadPath = (type, from, to) => {
  if (!['orders', 'finance'].includes(type) || !isCivilDate(from) || !isCivilDate(to) || from > to) {
    throw new Error('Selecione um período válido para exportar.');
  }
  const params = new URLSearchParams({ from, to });
  return `/api/exports/${type}?${params}`;
};
