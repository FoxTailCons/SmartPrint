export const splitInstallmentAmounts = (total, count) => {
  const installmentCount = Math.floor(Number(count));
  if (!Number.isFinite(installmentCount) || installmentCount < 1) return [];

  const totalCents = Math.max(0, Math.round((Number(total) || 0) * 100));
  const baseCents = Math.floor(totalCents / installmentCount);

  return Array.from({ length: installmentCount }, (_, index) => (
    (index === installmentCount - 1 ? totalCents - baseCents * (installmentCount - 1) : baseCents) / 100
  ));
};
