const saleUnits = ['unit', 'linear_meter', 'square_meter'];
const dimensionUnits = ['cm', 'm'];

const positiveFinite = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} deve ser maior que zero`);
  }
  return value;
};

const positiveInteger = (value, label) => {
  if (!Number.isInteger(value) || value <= 0) {
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
}) {
  const productName = String(pricingSnapshot?.productName ?? product?.name ?? '').trim();
  const saleUnit = pricingSnapshot?.saleUnit ?? product?.saleUnit;
  const unitPrice = pricingSnapshot?.unitPrice ?? product?.price;
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

  const total = itemQuantity * unitPrice;
  if (!Number.isFinite(itemQuantity) || !Number.isFinite(total)) {
    throw new Error('As medidas informadas excedem o limite que pode ser calculado');
  }

  return {
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
