import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { buildPaginatedUrl, normalizePageResponse } from './serverPagination.js';

export function useServerPagination(path, filters, page, pageSize = 20) {
  const [result, setResult] = useState({
    items: [],
    page: 1,
    pageSize,
    total: 0,
    summary: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);
  const filterQuery = new URLSearchParams(filters).toString();

  useEffect(() => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError('');

    api(buildPaginatedUrl(path, filterQuery, page, pageSize))
      .then((response) => {
        if (requestId.current === currentRequestId) {
          setResult(normalizePageResponse(response, page, pageSize));
        }
      })
      .catch((requestError) => {
        if (requestId.current === currentRequestId) setError(requestError.message);
      })
      .finally(() => {
        if (requestId.current === currentRequestId) setLoading(false);
      });

    return () => {
      if (requestId.current === currentRequestId) requestId.current += 1;
    };
  }, [path, filterQuery, page, pageSize, reloadKey]);

  return {
    ...result,
    loading,
    error,
    retry: () => setReloadKey((current) => current + 1),
  };
}
