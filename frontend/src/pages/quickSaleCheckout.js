export function createQuickSaleCheckout(post, createId = () => crypto.randomUUID(), { storage, storageKey } = {}) {
  const saved = storage?.getItem(storageKey);
  let request = saved ? JSON.parse(saved) : null;
  if (request && (!request.requestId || !Array.isArray(request.items) || request.items.length !== 1 || !request.items[0].productId || !Number.isSafeInteger(request.items[0].quantity) || request.items[0].quantity <= 0 || !['pix', 'dinheiro', 'debito', 'credito'].includes(request.paymentMethod))) {
    throw new Error('A tentativa de venda salva está inválida. Confira os pedidos antes de limpar os dados do navegador.');
  }
  let inFlight = null;
  let completed = null;
  return {
    getPending: () => request,
    submit({ product, quantity, paymentMethod }) {
      if (completed) return completed;
      if (inFlight) return inFlight;
      if (!request) {
        const count = Number(quantity);
        if (!product?._id || product.active === false || product.saleUnit !== 'unit') throw new Error('Selecione um produto ativo por unidade.');
        if (!Number.isSafeInteger(count) || count <= 0) throw new Error('Informe uma quantidade inteira positiva.');
        if (!['pix', 'dinheiro', 'debito', 'credito'].includes(paymentMethod)) throw new Error('Selecione uma forma de pagamento válida.');
        const nextRequest = { items: [{ productId: product._id, quantity: count }], paymentMethod, requestId: createId() };
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
