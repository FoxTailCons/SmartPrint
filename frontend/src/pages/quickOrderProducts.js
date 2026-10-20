export const normalizeQuickOrderProducts = (response) => {
  const products = Array.isArray(response) ? response : response?.items;
  if (!Array.isArray(products)) throw new Error('A API retornou uma lista de produtos inválida.');
  return products.filter((product) => product.active !== false && product.saleUnit === 'unit');
};

export const filterQuickOrderProducts = (products, query) => {
  const search = String(query || '').trim().toLocaleLowerCase('pt-BR');
  if (!search) return products;
  return products.filter((product) => (
    `${product.name || ''} ${product.code || ''}`.toLocaleLowerCase('pt-BR').includes(search)
  ));
};
