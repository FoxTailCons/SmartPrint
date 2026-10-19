import { getPageItems } from './usePagination.js';

export const buildPaginatedUrl = (path, filters, page, pageSize) => {
  const params = new URLSearchParams(filters);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return `${path}?${params.toString()}`;
};

export const normalizePageResponse = (response, requestedPage, requestedPageSize) => {
  if (Array.isArray(response)) {
    return { ...getPageItems(response, requestedPage, requestedPageSize), summary: null };
  }

  if (!response || !Array.isArray(response.items)
    || !Number.isSafeInteger(response.page) || response.page < 1
    || !Number.isSafeInteger(response.pageSize) || response.pageSize < 1
    || !Number.isSafeInteger(response.total) || response.total < 0) {
    throw new Error('A API retornou uma resposta de paginação inválida.');
  }

  return {
    items: response.items,
    page: response.page,
    pageSize: response.pageSize,
    total: response.total,
    summary: response.summary ?? null,
  };
};
