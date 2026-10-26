const parsePositiveInteger = (value, name) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return { error: `O parâmetro ${name} deve ser um inteiro positivo` };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return { error: `O parâmetro ${name} deve ser um inteiro positivo` };
  }

  return { value: parsed };
};

export const parsePagination = (query, { defaultPageSize = 100, maxPageSize = 100 } = {}) => {
  const hasPage = query.page !== undefined;
  const hasPageSize = query.pageSize !== undefined;
  if (!hasPage && !hasPageSize) return null;

  const pageResult = hasPage ? parsePositiveInteger(query.page, 'page') : { value: 1 };
  if (pageResult.error) return pageResult;

  const pageSizeResult = hasPageSize
    ? parsePositiveInteger(query.pageSize, 'pageSize')
    : { value: defaultPageSize };
  if (pageSizeResult.error) return pageSizeResult;

  const pageSize = Math.min(pageSizeResult.value, maxPageSize);
  const skip = (pageResult.value - 1) * pageSize;
  if (!Number.isSafeInteger(skip)) return { error: 'A página solicitada está fora do intervalo permitido' };

  return { page: pageResult.value, pageSize, skip };
};

export const getEffectivePage = (page, pageSize, total) => (
  Math.min(page, Math.max(1, Math.ceil(total / pageSize)))
);

export const buildPage = (items, page, pageSize, total) => ({
  items,
  page,
  pageSize,
  total,
});
