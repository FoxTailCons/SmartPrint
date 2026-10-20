import { getQuantityPrice } from './catalogPricing.js';

export function calculateAreaPerPiece({ width, height, unit, moldEnabled, moldFactor }) {
  const unitInMeters = unit === 'cm' ? 0.01 : 1;
  const factor = moldEnabled ? moldFactor : 1;
  return width * unitInMeters * height * unitInMeters * factor;
}

export function buildMeasuredItem({ width, height, pieces = 1, unit = 'm', moldEnabled = false, moldFactor = 1, saleMode = 'area', multiplyByPieces = true, pricePerSquareMeter = 0, product, description = '', installationFee = 0, travelFee = 0 }) {
  if (![width, height, pieces, pricePerSquareMeter, installationFee, travelFee].every(Number.isFinite)
    || width <= 0 || height <= 0 || !Number.isInteger(pieces) || pieces <= 0 || pricePerSquareMeter < 0
    || installationFee < 0 || travelFee < 0 || !['cm', 'm'].includes(unit)
    || (moldEnabled && (!Number.isFinite(moldFactor) || moldFactor <= 0))) {
    throw new Error('Informe medidas e quantidade válidas e valores não negativos.');
  }
  const areaPerPiece = calculateAreaPerPiece({ width, height, unit, moldEnabled, moldFactor });
  const pieceCount = product || saleMode !== 'area' || multiplyByPieces ? pieces : 1;
  const area = areaPerPiece * pieceCount;
  const quantity = product || saleMode === 'area' ? area : pieces;
  const unitPrice = product ? getQuantityPrice(product, quantity).unitPrice : saleMode === 'area' ? pricePerSquareMeter : areaPerPiece * pricePerSquareMeter;
  const total = quantity * unitPrice + installationFee + travelFee;
  if (![areaPerPiece, area, quantity, unitPrice, total].every(Number.isFinite)) throw new Error('Os valores excedem o limite de cálculo.');
  const meters = unit === 'cm' ? 0.01 : 1;
  const format = (value) => (value * meters).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const serviceName = description.trim() || 'Serviço';
  return {
    description: `${serviceName} ${format(width)}x${format(height)}m${product ? ` — ${product.name}` : ''}`,
    serviceName,
    ...(product ? { productId: product._id, productName: product.name, saleUnit: 'square_meter', material: product.name, pricingBasis: { basePrice: product.price, priceTiers: product.priceTiers || [] } } : {}),
    measurements: { width, height, dimensionUnit: unit, pieceCount, moldEnabled, moldFactor: moldEnabled ? moldFactor : undefined },
    quantity, unitPrice, total, areaPerPiece, area, installationFee, travelFee,
  };
}
