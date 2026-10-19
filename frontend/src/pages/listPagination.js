import { getPageItems } from '../hooks/usePagination.js';

export const getDashboardPage = (items, page, pageSize) => getPageItems(items, page, pageSize);

export const toggleSelectedOrder = (selectedIds, orderId) => (
  selectedIds.includes(orderId)
    ? selectedIds.filter((selectedId) => selectedId !== orderId)
    : [...selectedIds, orderId]
);
