const saleUnits = ['unit', 'linear_meter', 'square_meter'];
const dimensionUnits = ['cm', 'm'];

const positiveFinite = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} deve ser maior que zero`);
  }
  return value;
};

const positiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} deve ser um número inteiro maior que zero`);
  }
  return value;
};

export function buildCatalogOrderItem({
  product,
  quantity,
  pieceCount,
  lengthPerPiece,
  width,
  height,
  dimensionUnit,
  moldEnabled = false,
  moldFactor,
  pricingSnapshot,
  ...metadataInput
}) {
  const productName = String(pricingSnapshot?.productName ?? product?.name ?? '').trim();
  const saleUnit = pricingSnapshot?.saleUnit ?? product?.saleUnit;
  let unitPrice = pricingSnapshot?.unitPrice ?? product?.price;
  const pricingBasis = pricingSnapshot ? pricingSnapshot.pricingBasis : { basePrice: product?.price, priceTiers: normalizePriceTiers(product?.priceTiers) };
  const metadata = normalizeItemMetadata(metadataInput);
  const productId = product?._id;

  if (!productId || !productName) throw new Error('Produto inválido');
  if (!saleUnits.includes(saleUnit)) throw new Error('Unidade de venda inválida');
  if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('Preço do produto inválido');
  }

  let itemQuantity;
  let measurements;
  let description = productName;

  if (saleUnit === 'unit') {
    itemQuantity = positiveInteger(quantity, 'Quantidade');
    measurements = { pieceCount: itemQuantity };
  } else if (saleUnit === 'linear_meter') {
    const count = positiveInteger(pieceCount, 'Quantidade de peças');
    const length = positiveFinite(lengthPerPiece, 'Comprimento por peça');
    itemQuantity = count * length;
    measurements = { pieceCount: count, lengthPerPiece: length };
    description = `${productName} - ${length} m x ${count} peça(s)`;
  } else {
    const count = positiveInteger(pieceCount, 'Quantidade de peças');
    const measuredWidth = positiveFinite(width, 'Largura');
    const measuredHeight = positiveFinite(height, 'Altura');
    if (!dimensionUnits.includes(dimensionUnit)) throw new Error('Unidade de dimensão inválida');
    if (typeof moldEnabled !== 'boolean') throw new Error('Opção de molde inválida');
    if (moldEnabled) positiveFinite(moldFactor, 'Fator de molde');

    const metersPerUnit = dimensionUnit === 'cm' ? 0.01 : 1;
    const factor = moldEnabled ? moldFactor : 1;
    itemQuantity = measuredWidth * metersPerUnit * measuredHeight * metersPerUnit * count * factor;
    measurements = {
      pieceCount: count,
      width: measuredWidth,
      height: measuredHeight,
      dimensionUnit,
      moldEnabled,
      moldFactor: moldEnabled ? moldFactor : undefined,
    };
    description = `${productName} - ${measuredWidth} x ${measuredHeight} ${dimensionUnit} - ${count} peça(s)`;
  }

  if (pricingBasis) {
    unitPrice = pricingBasis.basePrice;
    for (const tier of normalizePriceTiers(pricingBasis.priceTiers)) {
      if (itemQuantity >= tier.minQuantity) unitPrice = tier.price;
    }
  }
  if (metadata.serviceName) description = description.replace(productName, metadata.serviceName);
  if (metadata.material) description += ` - ${metadata.material}`;
  const total = itemQuantity * unitPrice + (metadata.installationFee || 0) + (metadata.travelFee || 0);
  if (!Number.isFinite(itemQuantity) || !Number.isFinite(total)) {
    throw new Error('As medidas informadas excedem o limite que pode ser calculado');
  }

  return {
    ...metadata,
    ...(pricingBasis ? { pricingBasis } : {}),
    productId,
    productName,
    saleUnit,
    description,
    quantity: itemQuantity,
    unitPrice,
    total,
    measurements,
  };
}

export function normalizePriceTiers(value = []) {
  if (!Array.isArray(value)) throw new Error('Tabela de preços inválida');
  const seen = new Set();
  return value.map(tier => {
    if (!tier || typeof tier.minQuantity !== 'number' || !Number.isFinite(tier.minQuantity) || tier.minQuantity <= 0 || typeof tier.price !== 'number' || !Number.isFinite(tier.price) || tier.price < 0 || seen.has(tier.minQuantity)) throw new Error('Faixa de preço inválida ou duplicada');
    seen.add(tier.minQuantity);
    return {minQuantity:tier.minQuantity,price:tier.price};
  }).sort((a,b)=>a.minQuantity-b.minQuantity);
}

export function normalizeItemMetadata(item = {}) {
  const result = {};
  for (const key of ['serviceName','material','finishing','applicationLocation','promisedDate','artworkUrl','installationNotes']) {
    if (item[key] === undefined || item[key] === null) continue;
    if (typeof item[key] !== 'string') throw new Error(`Campo ${key} inválido`);
    result[key] = item[key].trim();
  }
  if (result.promisedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(result.promisedDate) || !Number.isFinite(Date.parse(result.promisedDate)) || new Date(result.promisedDate).toISOString().slice(0,10)!==result.promisedDate)) throw new Error('Data prometida inválida');
  if (result.artworkUrl) {
    let url; try { url = new URL(result.artworkUrl); } catch { throw new Error('Link da arte inválido'); }
    if (!['http:','https:'].includes(url.protocol)) throw new Error('Link da arte deve usar HTTP ou HTTPS');
  }
  for (const key of ['installationFee','travelFee']) {
    if (item[key] === undefined) continue;
    if (typeof item[key] !== 'number' || !Number.isFinite(item[key]) || item[key]<0) throw new Error(`Valor ${key} inválido`);
    result[key] = item[key];
  }
  return result;
}
