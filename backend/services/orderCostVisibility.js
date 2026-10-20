export const hideOrderCosts = (value) => {
  if (Array.isArray(value)) return value.map(hideOrderCosts);
  if (value && typeof value.toObject === 'function') return hideOrderCosts(value.toObject());
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'costUnitPrice')
      .map(([key, item]) => [key, hideOrderCosts(item)])
  );
};
