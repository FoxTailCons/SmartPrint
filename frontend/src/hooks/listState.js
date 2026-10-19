export const getListState = ({ loading, error, items }) => {
  if (loading) return 'loading';
  if (error) return 'error';
  if (!Array.isArray(items) || items.length === 0) return 'empty';
  return 'ready';
};
