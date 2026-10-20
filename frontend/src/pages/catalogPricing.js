export function parsePriceTiers(rows = []) {
  const minimums = new Set();
  return rows.map((row) => {
    const minQuantity = Number(row.minQuantity);
    const price = Number(row.price);
    if (String(row.minQuantity).trim() === '' || !Number.isFinite(minQuantity) || minQuantity <= 0 || minimums.has(minQuantity)) {
      throw new Error('Informe mínimos positivos e diferentes para cada faixa.');
    }
    if (String(row.price).trim() === '' || !Number.isFinite(price) || price < 0) {
      throw new Error('Informe um preço válido, maior ou igual a zero, para cada faixa.');
    }
    minimums.add(minQuantity);
    return { minQuantity, price };
  });
}

export function getQuantityPrice(product, quantity) {
  const count = Number(quantity);
  if (!Number.isFinite(count) || count <= 0) throw new Error('Informe uma quantidade positiva.');
  const basis = product.pricingBasis?.basePrice != null ? product.pricingBasis : product;
  let unitPrice = Number(basis.basePrice ?? basis.price ?? basis.unitPrice);
  let minQuantity = null;
  for (const tier of basis.priceTiers || []) {
    if (tier.minQuantity <= count && (minQuantity === null || tier.minQuantity > minQuantity)) {
      unitPrice = Number(tier.price);
      minQuantity = tier.minQuantity;
    }
  }
  return { unitPrice, minQuantity, total: count * unitPrice };
}
