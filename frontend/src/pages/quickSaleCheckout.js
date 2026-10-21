export const getQuickSaleUserId = (user) => user?.id ?? user?._id;

export function createQuickSaleCheckout(post, createId = () => crypto.randomUUID(), { storage, storageKey } = {}) {
  const saved = storage?.getItem(storageKey);
  let request = saved ? JSON.parse(saved) : null;
  if (request && (!request.requestId || !Array.isArray(request.items) || !request.items.length || request.items.some((item) => !item.productId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) || !['pix', 'dinheiro', 'debito', 'credito'].includes(request.paymentMethod))) {
    throw new Error('A tentativa de venda salva está inválida. Confira os pedidos antes de limpar os dados do navegador.');
  }
  let inFlight = null;
  let completed = null;
  return {
    getPending: () => request,
    submit({ items, paymentMethod }) {
      if (completed) return completed;
      if (inFlight) return inFlight;
      if (!request) {
        if (!Array.isArray(items) || !items.length) throw new Error('Adicione ao menos um produto.');
        for (const { product, quantity } of items) {
          const count = Number(quantity);
          if (!product?._id || product.active === false || product.saleUnit !== 'unit') throw new Error('Selecione apenas produtos ativos por unidade.');
          if (!Number.isSafeInteger(count) || count <= 0) throw new Error('Informe uma quantidade inteira positiva para cada produto.');
        }
        if (!['pix', 'dinheiro', 'debito', 'credito'].includes(paymentMethod)) throw new Error('Selecione uma forma de pagamento válida.');
        const nextRequest = { items: items.map(({ product, quantity }) => ({ productId: product._id, quantity: Number(quantity) })), paymentMethod, requestId: createId() };
        storage?.setItem(storageKey, JSON.stringify(nextRequest));
        request = nextRequest;
      }
      inFlight = Promise.resolve().then(() => post(request)).then((order) => {
        storage?.removeItem(storageKey);
        request = null;
        completed = Promise.resolve(order);
        return order;
      }).catch((error) => {
        if ([400, 422].includes(error.status)) {
          storage?.removeItem(storageKey);
          request = null;
        }
        throw error;
      }).finally(() => { inFlight = null; });
      return inFlight;
    },
    reset() {
      if (inFlight) throw new Error('Aguarde o envio da venda.');
      if (request) throw new Error('Resolva a tentativa pendente antes de iniciar outra venda.');
      completed = null;
    },
  };
}
