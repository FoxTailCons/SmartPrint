import { useEffect, useState } from 'react';

const DEFAULT_PAGE_SIZE = 10;

const normalizePositiveInteger = (value, fallback) => (
  Number.isSafeInteger(value) && value > 0 ? value : fallback
);

export const getPaginationState = (page, pageSize, total) => {
  const safePageSize = normalizePositiveInteger(pageSize, DEFAULT_PAGE_SIZE);
  const safeTotal = Number.isSafeInteger(total) && total > 0 ? total : 0;
  const pageCount = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const safePage = Math.min(normalizePositiveInteger(page, 1), pageCount);
  const firstItem = safeTotal ? ((safePage - 1) * safePageSize) + 1 : 0;

  return {
    page: safePage,
    pageCount,
    firstItem,
    lastItem: Math.min(safePage * safePageSize, safeTotal),
    total: safeTotal,
    canGoPrevious: safePage > 1,
    canGoNext: safePage < pageCount,
  };
};

export const getPageItems = (items, page, pageSize) => {
  const source = Array.isArray(items) ? items : [];
  const safePageSize = normalizePositiveInteger(pageSize, DEFAULT_PAGE_SIZE);
  const state = getPaginationState(page, safePageSize, source.length);

  return {
    items: source.slice((state.page - 1) * safePageSize, state.page * safePageSize),
    page: state.page,
    pageSize: safePageSize,
    total: source.length,
  };
};

export function usePagination(items, pageSize = DEFAULT_PAGE_SIZE) {
  const [requestedPage, setRequestedPage] = useState(1);
  const result = getPageItems(items, requestedPage, pageSize);
  const pageCount = getPaginationState(result.page, result.pageSize, result.total).pageCount;

  useEffect(() => {
    setRequestedPage((currentPage) => Math.min(currentPage, pageCount));
  }, [pageCount]);

  return { ...result, setPage: setRequestedPage };
}
