import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api.js';
import PaymentReceiptPrintButton from '../components/PaymentReceiptPrintButton.jsx';
import { getQuantityPrice } from './catalogPricing.js';
import { createQuickSaleCheckout, getQuickSaleUserId } from './quickSaleCheckout.js';
import { createPaymentReceipt } from './paymentReceipt.js';
import { roundOrderTotalUp } from './orderPresentation.js';
import { useAuth } from '../context/AuthContext.jsx';
import ProductCombobox from '../components/ProductCombobox.jsx';
import { normalizeQuickOrderProducts } from './quickOrderProducts.js';

const inputClass = 'mt-1 w-full rounded-lg border bg-white px-3 py-2';

export function addQuickOrderItem(items, productId, quantity) {
  const existing = items.find((item) => item.productId === productId);
  return existing
    ? items.map((item) => item.productId === productId ? { ...item, quantity: Number(item.quantity) + quantity } : item)
    : [...items, { productId, quantity }];
}

export function QuickSaleResult({ order, onNewSale }) {
  const receipt = createPaymentReceipt(order, (order.payments?.length || 0) - 1);
  return (
    <div className="space-y-4 rounded-xl border border-green-200 bg-white p-5" role="status">
      <h2 className="text-xl font-semibold text-green-800">Venda concluída · #{order.number}</h2>
      <p>Recebido: <strong>{fmt(order.finalValue)}</strong> · Entregue</p>
      <div className="flex flex-wrap items-center gap-3">
        {receipt && <PaymentReceiptPrintButton text={receipt.text} />}
        <Link to={`/pedidos/${order._id}`} className="rounded-lg border px-3 py-2 text-sm">Ver pedido</Link>
        <button type="button" onClick={onNewSale} className="rounded-lg bg-brand-600 px-4 py-2 text-white">Nova venda (F2)</button>
      </div>
    </div>
  );
}

export default function QuickOrder() {
  const { user } = useAuth();
  const userId = getQuickSaleUserId(user);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [cart, setCart] = useState([]);
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const productSelect = useRef(null);
  const checkout = useRef(null);
  useEffect(() => {
    checkout.current = null;
    setCheckoutReady(false);
    setAttempted(false);
    setOrder(null);
    setCart([]);
    setProductId('');
    setProductSearch('');
    setQuantity('1');
    setPaymentMethod('pix');
    if (!userId) return;
    try {
      if (!window.sessionStorage) throw new Error('Armazenamento de sessão indisponível.');
      checkout.current = createQuickSaleCheckout((body) => api('/api/orders/quick-sale', { method: 'POST', body }), undefined, {
        storage: window.sessionStorage,
        storageKey: `sp_quick_sale:${userId}`,
      });
      const pending = checkout.current.getPending();
      if (pending) {
        setCart(pending.items.map(({ productId: pendingProductId, quantity: pendingQuantity }) => ({
          productId: pendingProductId,
          quantity: pendingQuantity,
        })));
        setPaymentMethod(pending.paymentMethod);
        setAttempted(true);
        setError('Há uma venda aguardando confirmação. Tente novamente para recuperar o resultado da mesma venda.');
      }
      setCheckoutReady(true);
    } catch (storageError) {
      setError(`Não foi possível recuperar ou proteger a tentativa de venda: ${storageError.message}`);
    }
  }, [userId]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError('');
    api('/api/products').then((data) => {
      if (current) setProducts(normalizeQuickOrderProducts(data));
    }).catch((requestError) => { if (current) setLoadError(requestError.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [reload]);

  const newSale = () => {
    checkout.current.reset();
    setOrder(null);
    setAttempted(false);
    setError('');
    setCart([]);
    setProductId('');
    setProductSearch('');
    setQuantity('1');
    setPaymentMethod('pix');
  };
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key !== 'F2') return;
      event.preventDefault();
      if (order) newSale();
      else if (!attempted) productSelect.current?.focus();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [order, attempted]);

  const product = products.find((entry) => entry._id === productId);
  const validQuantity = Number.isSafeInteger(Number(quantity)) && Number(quantity) > 0;
  const price = product && validQuantity ? getQuantityPrice(product, Number(quantity)) : null;
  const cartTotal = cart.reduce((total, item) => {
    const cartProduct = products.find((entry) => entry._id === item.productId);
    if (!cartProduct || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0) return total;
    return total + getQuantityPrice(cartProduct, Number(item.quantity)).total;
  }, 0);
  const cartReady = cart.length > 0 && cart.every((item) => {
    const cartProduct = products.find((entry) => entry._id === item.productId);
    return cartProduct?.active !== false && cartProduct?.saleUnit === 'unit'
      && Number.isSafeInteger(Number(item.quantity)) && Number(item.quantity) > 0;
  });
  const addProduct = () => {
    if (!product || !validQuantity) return;
    const count = Number(quantity);
    setCart((current) => addQuickOrderItem(current, product._id, count));
    setProductId('');
    setProductSearch('');
    setQuantity('1');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const pending = checkout.current.submit({
        items: cart.map((item) => ({
          product: products.find((entry) => entry._id === item.productId),
          quantity: item.quantity,
        })),
        paymentMethod,
      });
      setAttempted(true);
      setOrder(await pending);
    } catch (requestError) {
      setError(requestError.message);
      setAttempted(!!checkout.current?.getPending());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div><h1 className="text-2xl font-bold">Pedido rápido</h1><p className="text-sm text-slate-500">Venda de balcão · pagamento integral e entrega imediata</p></div>
      {order ? <QuickSaleResult order={order} onNewSale={newSale} /> : (
        <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          {loadError && <div role="alert" className="text-sm text-red-700">{loadError} <button type="button" onClick={() => setReload((value) => value + 1)} className="underline">Tentar carregar novamente</button></div>}
          <fieldset disabled={!checkoutReady || attempted || loading || !!loadError} className="space-y-4 disabled:opacity-70">
            <label className="block text-sm font-medium">Adicionar produto por unidade
              <ProductCombobox
                products={products}
                value={productId}
                onChange={setProductId}
                query={productSearch}
                onQueryChange={setProductSearch}
                loading={loading}
                inputRef={productSelect}
              />
            </label>
            <div className="flex items-end gap-3">
              <label className="min-w-0 flex-1 text-sm font-medium" htmlFor="quick-quantity">Quantidade
                <input id="quick-quantity" type="number" required min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
              </label>
              <button type="button" disabled={!price} onClick={addProduct} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Adicionar</button>
            </div>
            {price && <p className="text-xs text-slate-500">{price.minQuantity === null ? 'Preço base' : `Faixa a partir de ${price.minQuantity}`} · {fmt(price.unitPrice)} / un. · {fmt(price.total)}</p>}
            <label className="block text-sm font-medium" htmlFor="quick-payment">Pagamento
              <select id="quick-payment" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputClass}>
                <option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="debito">Cartão de débito</option><option value="credito">Cartão de crédito</option>
              </select>
            </label>
          </fieldset>
          {cart.length > 0 && (
            <section aria-label="Produtos da venda" className="space-y-3 rounded-lg border p-4">
              <h2 className="font-semibold">Produtos adicionados</h2>
              <ul className="divide-y">
                {cart.map((item) => {
                  const cartProduct = products.find((entry) => entry._id === item.productId);
                  const linePrice = cartProduct && Number.isSafeInteger(Number(item.quantity)) && Number(item.quantity) > 0
                    ? getQuantityPrice(cartProduct, Number(item.quantity))
                    : null;
                  return (
                    <li key={item.productId} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{cartProduct?.name || 'Produto não disponível'}</p>
                        {linePrice && <p className="text-xs text-slate-500">{fmt(linePrice.unitPrice)} / un. · {fmt(linePrice.total)}</p>}
                      </div>
                      <label className="text-xs text-slate-600">Qtd.
                        <input
                          aria-label={`Quantidade de ${cartProduct?.name || 'produto'}`}
                          type="number"
                          min="1"
                          step="1"
                          disabled={attempted}
                          value={item.quantity}
                          onChange={(event) => setCart((current) => current.map((entry) => entry.productId === item.productId ? { ...entry, quantity: event.target.value } : entry))}
                          className="ml-2 w-20 rounded-lg border px-2 py-1.5 text-sm"
                        />
                      </label>
                      <button
                        type="button"
                        aria-label={`Remover ${cartProduct?.name || 'produto'}`}
                        disabled={attempted}
                        onClick={() => setCart((current) => current.filter((entry) => entry.productId !== item.productId))}
                        className="rounded-lg border px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
                      >
                        Remover
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div aria-live="polite" className="border-t pt-3">
                <p className="text-2xl font-bold">Total: {fmt(roundOrderTotalUp(cartTotal, 0))}</p>
                <p className="text-xs text-slate-500">Total arredondado. O servidor confirma o valor ao concluir.</p>
              </div>
            </section>
          )}
          {error && <div role="alert" className="space-y-1 text-sm text-red-700"><p>{error}</p>{attempted && <p>A venda pode ter sido registrada. Tente novamente para consultar ou concluir a mesma venda, sem cobrar duas vezes.</p>}</div>}
          <button type="submit" disabled={!checkoutReady || saving || (!attempted && (loading || !!loadError || !cartReady))} className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{saving ? 'Registrando...' : attempted ? 'Tentar a mesma venda novamente' : 'Receber e entregar'}</button>
        </form>
      )}
    </div>
  );
}
