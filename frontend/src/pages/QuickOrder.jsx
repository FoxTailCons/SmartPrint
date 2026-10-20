import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api.js';
import PaymentReceiptPrintButton from '../components/PaymentReceiptPrintButton.jsx';
import { getQuantityPrice } from './catalogPricing.js';
import { createQuickSaleCheckout } from './quickSaleCheckout.js';
import { createPaymentReceipt } from './paymentReceipt.js';
import { roundOrderTotalUp } from './orderPresentation.js';
import { useAuth } from '../context/AuthContext.jsx';
import { filterQuickOrderProducts, normalizeQuickOrderProducts } from './quickOrderProducts.js';

const inputClass = 'mt-1 w-full rounded-lg border bg-white px-3 py-2';

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
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
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
    setProductId('');
    setProductSearch('');
    setQuantity('1');
    setPaymentMethod('pix');
    if (!user?._id) return;
    try {
      if (!window.sessionStorage) throw new Error('Armazenamento de sessão indisponível.');
      checkout.current = createQuickSaleCheckout((body) => api('/api/orders/quick-sale', { method: 'POST', body }), undefined, {
        storage: window.sessionStorage,
        storageKey: `sp_quick_sale:${user._id}`,
      });
      const pending = checkout.current.getPending();
      if (pending) {
        setProductId(pending.items[0].productId);
        setQuantity(String(pending.items[0].quantity));
        setPaymentMethod(pending.paymentMethod);
        setAttempted(true);
        setError('Há uma venda aguardando confirmação. Tente novamente para recuperar o resultado da mesma venda.');
      }
      setCheckoutReady(true);
    } catch (storageError) {
      setError(`Não foi possível recuperar ou proteger a tentativa de venda: ${storageError.message}`);
    }
  }, [user?._id]);

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
  const filteredProducts = filterQuickOrderProducts(products, productSearch);
  const visibleProducts = product && !filteredProducts.some((entry) => entry._id === product._id)
    ? [product, ...filteredProducts]
    : filteredProducts;
  const validQuantity = Number.isSafeInteger(Number(quantity)) && Number(quantity) > 0;
  const price = product && validQuantity ? getQuantityPrice(product, Number(quantity)) : null;
  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const pending = checkout.current.submit({ product, quantity, paymentMethod });
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
            <label className="block text-sm font-medium" htmlFor="quick-product-search">Buscar produto
              <input id="quick-product-search" aria-label="Buscar produto" type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Buscar por nome ou código..." className={inputClass} />
            </label>
            <label className="block text-sm font-medium" htmlFor="quick-product">Produto por unidade
              <select ref={productSelect} id="quick-product" autoFocus required value={productId} onChange={(event) => setProductId(event.target.value)} className={inputClass}>
                <option value="">{loading ? 'Carregando...' : 'Selecione um produto'}</option>
                {attempted && productId && !product && <option value={productId}>Produto da venda pendente</option>}
                {visibleProducts.map((entry) => <option key={entry._id} value={entry._id}>{entry.code ? `${entry.code} · ` : ''}{entry.name}</option>)}
              </select>
            </label>
            {!loading && !loadError && products.length === 0 && <p className="text-sm text-slate-500">Nenhum produto ativo por unidade disponível.</p>}
            {!loading && !loadError && products.length > 0 && filteredProducts.length === 0 && <p className="text-sm text-slate-500">Nenhum produto corresponde à busca.</p>}
            <label className="block text-sm font-medium" htmlFor="quick-quantity">Quantidade
              <input id="quick-quantity" type="number" required min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={inputClass} />
            </label>
            <label className="block text-sm font-medium" htmlFor="quick-payment">Pagamento
              <select id="quick-payment" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputClass}>
                <option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="debito">Cartão de débito</option><option value="credito">Cartão de crédito</option>
              </select>
            </label>
          </fieldset>
          {price && <div aria-live="polite" className="rounded-lg bg-slate-50 p-4"><p className="text-sm">{price.minQuantity === null ? 'Preço base' : `Faixa a partir de ${price.minQuantity}`} · {fmt(price.unitPrice)} / un.</p><p className="text-2xl font-bold">Total: {fmt(roundOrderTotalUp(price.total, 0))}</p><p className="text-xs text-slate-500">Total arredondado. O servidor confirma o valor ao concluir.</p></div>}
          {error && <div role="alert" className="space-y-1 text-sm text-red-700"><p>{error}</p>{attempted && <p>A venda pode ter sido registrada. Tente novamente para consultar ou concluir a mesma venda, sem cobrar duas vezes.</p>}</div>}
          <button type="submit" disabled={!checkoutReady || saving || (!attempted && (loading || !!loadError || !price))} className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{saving ? 'Registrando...' : attempted ? 'Tentar a mesma venda novamente' : 'Receber e entregar'}</button>
        </form>
      )}
    </div>
  );
}
