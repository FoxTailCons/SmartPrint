import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Plus, Trash2, Save, UserPlus, Ruler } from 'lucide-react';
import { api, fmt } from '../api';
import { addCalendarMonths, calendarDate, getSaoPauloDateKey } from '../dateUtils.js';
import Modal from '../components/Modal.jsx';
import MeasureCalculator from '../components/MeasureCalculator.jsx';
import { calculateAreaPerPiece } from './measurements.js';
import { splitInstallmentAmounts } from './installmentMath.js';
import { getOrderDocumentLabel, roundOrderTotalUp } from './orderPresentation.js';
import { getQuantityPrice } from './catalogPricing.js';
import { getCategoryLabel, itemTotal, normalizeSkippedStages, priorityLabels, productCategories, productionStages, requiresQuoteClient, serializeOrderItems, updateSkippedStagesForRequirement } from './printshop.js';
import GraphicItemFields from '../components/GraphicItemFields.jsx';

const emptyItem = { description: '', quantity: 1, unitPrice: 0, total: 0 };
const emptyCatalogMeasure = {
  pieceCount: '1',
  lengthPerPiece: '',
  width: '',
  height: '',
  distanceKm: '',
  dimensionUnit: 'm',
};
const emptyNewClient = {
  name: '', phone: '', email: '', document: '', address: '', addressNumber: '',
  addressComplement: '', neighborhood: '', city: '', state: '', zipCode: '',
  stateRegistration: '', contact: '',
};
const saleUnitLabels = { unit: 'un.', linear_meter: 'm', square_meter: 'm²', kilometer: 'km' };

export default function OrderForm({ modal = false, open = true, onSaved, onCancel }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogProductId, setCatalogProductId] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');
  const [catalogMeasure, setCatalogMeasure] = useState(emptyCatalogMeasure);
  const [clientId, setClientId] = useState('');
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [discount, setDiscount] = useState(0);
  const [downPayment, setDownPayment] = useState(0);
  const [orderStatus, setOrderStatus] = useState('pendente');
  const [amountPaid, setAmountPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [observations, setObservations] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [priority, setPriority] = useState('normal');
  const [skippedStages, setSkippedStages] = useState(['acabamento']);
  const [installments, setInstallments] = useState([]); // {dueDate, amount}
  const [instCount, setInstCount] = useState(1);
  const [firstDue, setFirstDue] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [showMeasureCalculator, setShowMeasureCalculator] = useState(false);
  const [newClient, setNewClient] = useState(emptyNewClient);
  const [saving, setSaving] = useState(false);
  const [clientRequiredThreshold, setClientRequiredThreshold] = useState(100);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  useEffect(() => {
    api('/api/clients').then(setClients);
    api('/api/products').then(setProducts).catch((error) => setCatalogError(error.message));
    api('/api/orders/settings')
      .then((settings) => { setClientRequiredThreshold(settings.clientRequiredThreshold); setSettingsLoaded(true); })
      .catch((error) => setSettingsError(error.message));
    if (isEdit) {
      api(`/api/orders/${id}`).then((o) => {
        setClientId(o.client?._id || o.client);
        setItems(o.items?.length ? o.items : [{ ...emptyItem }]);
        setDiscount(o.discount || 0);
        setDownPayment(o.downPayment || 0);
        setOrderStatus(o.status || 'pendente');
        setAmountPaid(o.amountPaid || 0);
        setPaymentMethod(o.paymentMethod || 'pix');
        setDeliveryDate(calendarDate(o.deliveryDate));
        setObservations(o.observations || '');
        setAttachments(o.attachments || []);
        setPriority(o.priority || 'normal');
        setSkippedStages(normalizeSkippedStages(o.skippedStages || []));
        setInstallments(o.installments?.map((p) => ({ dueDate: calendarDate(p.dueDate), amount: p.amount })) || []);
      });
    }
  }, [id]);

  const itemsTotal = items.reduce((sum, item) => sum + itemTotal(item), 0);
  const finalValue = roundOrderTotalUp(itemsTotal, discount);
  const quoteItems = items.map((item) => item.category ? item : {
    ...item,
    category: products.find((product) => product._id === item.productId)?.category,
  });
  const clientRequired = (!isEdit || orderStatus === 'pendente')
    && requiresQuoteClient(finalValue, quoteItems, clientRequiredThreshold);
  const selectedClient = clients.find((client) => client._id === clientId);
  const clientRequirementError = clientRequired && (!selectedClient?.name?.trim() || !selectedClient?.phone?.trim())
    ? 'Este orçamento exige cliente cadastrado com nome e telefone.'
    : '';
  const selectedProduct = products.find((product) => product._id === catalogProductId);
  const visibleProducts = catalogCategory
    ? products.filter((product) => catalogCategory === 'sem_categoria' ? !product.category : product.category === catalogCategory)
    : products;
  const pieceCount = Number(catalogMeasure.pieceCount);
  const lengthPerPiece = Number(catalogMeasure.lengthPerPiece);
  const width = Number(catalogMeasure.width);
  const height = Number(catalogMeasure.height);
  const distanceKm = Number(catalogMeasure.distanceKm);
  let catalogQuantity = 0;
  let catalogValid = false;

  if (selectedProduct?.saleUnit === 'unit') {
    catalogQuantity = pieceCount;
    catalogValid = Number.isInteger(pieceCount) && pieceCount > 0;
  } else if (selectedProduct?.saleUnit === 'linear_meter') {
    catalogQuantity = pieceCount * lengthPerPiece;
    catalogValid = Number.isInteger(pieceCount) && pieceCount > 0 && Number.isFinite(lengthPerPiece) && lengthPerPiece > 0;
  } else if (selectedProduct?.saleUnit === 'kilometer') {
    catalogQuantity = distanceKm;
    catalogValid = Number.isFinite(distanceKm) && distanceKm > 0;
  } else if (selectedProduct?.saleUnit === 'square_meter') {
    const areaPerPiece = calculateAreaPerPiece({
      width,
      height,
      unit: catalogMeasure.dimensionUnit,
    });
    catalogQuantity = areaPerPiece * pieceCount;
    catalogValid = Number.isInteger(pieceCount) && pieceCount > 0
      && Number.isFinite(width) && width > 0
      && Number.isFinite(height) && height > 0
      && Number.isFinite(catalogQuantity);
  }
  const catalogPricing = selectedProduct && catalogValid ? getQuantityPrice(selectedProduct, catalogQuantity) : { unitPrice: selectedProduct?.price || 0, total: 0, minQuantity: null };
  const catalogTotal = catalogPricing.total;
  catalogValid = catalogValid && Number.isFinite(catalogTotal);

  const updateItem = (idx, field, val) => {
    setItems((current) => current.map((item, index) => {
      if (index !== idx) return item;
      const next = { ...item, [field]: val };
      if (field === 'quantity' && item.productId && ['unit', 'kilometer'].includes(item.saleUnit) && Number(val) > 0 && Number.isFinite(Number(val))) {
        next.unitPrice = getQuantityPrice(item, Number(val)).unitPrice;
        next.measurements = item.saleUnit === 'unit'
          ? { ...item.measurements, pieceCount: Number(val) }
          : { ...item.measurements, distanceKm: Number(val) };
      }
      next.total = itemTotal(next);
      return next;
    }));
  };

  const addCatalogItem = () => {
    if (!selectedProduct || !catalogValid) return;
    const count = pieceCount;
    const measurements = selectedProduct.saleUnit === 'unit'
      ? { pieceCount: count }
      : selectedProduct.saleUnit === 'linear_meter'
        ? { pieceCount: count, lengthPerPiece }
        : selectedProduct.saleUnit === 'kilometer'
          ? { distanceKm }
        : {
          pieceCount: count,
          width,
          height,
          dimensionUnit: catalogMeasure.dimensionUnit,
        };
    const description = selectedProduct.saleUnit === 'unit'
      ? selectedProduct.name
      : selectedProduct.saleUnit === 'linear_meter'
        ? `${selectedProduct.name} - ${lengthPerPiece} m x ${count} peça(s)`
        : selectedProduct.saleUnit === 'kilometer'
          ? `${selectedProduct.name} - ${distanceKm} km`
        : `${selectedProduct.name} - ${width} x ${height} ${catalogMeasure.dimensionUnit} - ${count} peça(s)`;
    setItems((current) => [...current, {
      productId: selectedProduct._id,
      productName: selectedProduct.name,
      category: selectedProduct.category,
      saleUnit: selectedProduct.saleUnit,
      description,
      quantity: catalogQuantity,
      unitPrice: catalogPricing.unitPrice,
      pricingBasis: { basePrice: selectedProduct.price, priceTiers: selectedProduct.priceTiers || [] },
      total: catalogTotal,
      measurements,
    }]);
    setCatalogProductId('');
    setCatalogMeasure(emptyCatalogMeasure);
  };

  const generateInstallments = () => {
    const n = Math.min(12, Math.max(1, Number(instCount) || 1));
    const amounts = splitInstallmentAmounts(finalValue - Number(downPayment || 0), n);
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({ dueDate: addCalendarMonths(firstDue || getSaoPauloDateKey(), i), amount: amounts[i] });
    }
    setInstallments(arr);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!settingsLoaded) return alert(settingsError || 'Não foi possível carregar as configurações do orçamento.');
    if (clientRequirementError) return alert(clientRequirementError);
    setSaving(true);
    try {
      const body = {
        client: clientId || null,
        items: serializeOrderItems(items),
        discount: Number(discount) || 0,
        downPayment: Number(downPayment) || 0,
        paymentMethod,
        deliveryDate: deliveryDate || undefined,
        observations,
        attachments: attachments.filter((item) => item.label?.trim() || item.url?.trim()),
        priority,
        skippedStages,
        installments: installments.map((p) => ({ ...p, dueDate: new Date(p.dueDate) })),
      };
      const saved = isEdit
        ? await api(`/api/orders/${id}`, { method: 'PUT', body })
        : await api('/api/orders', { method: 'POST', body });
      if (onSaved) onSaved(saved);
      else navigate(`/pedidos/${saved._id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createClient = async () => {
    if (!newClient.name.trim()) return alert('Informe o nome do cliente');
    if (!newClient.phone.trim()) return alert('Informe o telefone do cliente');
    try {
      const c = await api('/api/clients', { method: 'POST', body: { ...newClient, name: newClient.name.trim(), phone: newClient.phone.trim() } });
      setClients([...clients, c]);
      setClientId(c._id);
      setShowNewClient(false);
      setNewClient(emptyNewClient);
    } catch (e) { alert(e.message); }
  };

  const content = (
    <div className="w-full min-w-0 space-y-5">
      {!modal && <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isEdit
              ? `Editar ${getOrderDocumentLabel({ status: orderStatus, amountPaid })}`
              : 'Novo Orçamento'}
          </h1>
          <p className="text-sm text-slate-500">Grandes formatos · Adesivagem · SmartPrint Lindóia</p>
        </div>
        <Link to="/pedidos" className="text-sm text-slate-500 hover:underline">← Voltar</Link>
      </div>}

      <form onSubmit={save} className="space-y-5">
        {!isEdit && (
          <p className="rounded-lg border bg-white p-4 text-sm text-slate-600">Orçamentos ficam pendentes até aprovação. Para xerox e balcão, use <Link to="/pedido-rapido" className="font-medium text-brand-700 underline">Pedido rápido · F2</Link>.</p>
        )}

        {/* Cliente */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h2 className="font-semibold">Cliente</h2>
          <div className="flex gap-2">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="flex-1 px-3 py-2.5 border rounded-lg text-sm bg-white"
            >
              <option value="">Sem cliente cadastrado</option>
              {clients.map((c) => <option key={c._id} value={c._id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
            </select>
            <button type="button" onClick={() => setShowNewClient(true)} className="inline-flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm hover:bg-slate-50">
              <UserPlus size={16} /> Novo
            </button>
          </div>
          {settingsError && <p role="alert" className="text-sm text-red-600">Não foi possível carregar a regra de cliente: {settingsError}</p>}
          {clientRequired && !clientRequirementError && <p role="status" className="text-sm text-amber-700">Cliente com nome e telefone obrigatório para este orçamento.</p>}
          {clientRequirementError && <p role="alert" className="text-sm text-red-600">{clientRequirementError}</p>}
          {!clientRequired && <p className="text-xs text-slate-500">Cliente opcional até {fmt(clientRequiredThreshold)} para serviços sem categoria especial.</p>}
        </div>

        {/* Itens */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Itens / Serviços</h2>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setShowMeasureCalculator(true)} className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline">
                <Ruler size={14} /> Calcular por dimensão
              </button>
              <button type="button" onClick={() => setItems([...items, { ...emptyItem }])} className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
                <Plus size={14} /> Adicionar item
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-4 space-y-3">
            <div>
              <label htmlFor="catalog-product" className="block text-sm font-medium">Adicionar produto do catálogo</label>
              <p className="text-xs text-slate-500">Prévia estimada. O preço cadastrado será validado novamente ao salvar o pedido.</p>
            </div>
            {catalogError && <p role="alert" className="text-sm text-red-600">{catalogError}</p>}
            <label className="block text-sm">
              Filtrar por categoria
              <select value={catalogCategory} onChange={(event) => { setCatalogCategory(event.target.value); setCatalogProductId(''); }} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
                <option value="">Todas as categorias</option>
                <option value="sem_categoria">Sem categoria</option>
                {productCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </label>
            <select
              id="catalog-product"
              value={catalogProductId}
              onChange={(event) => setCatalogProductId(event.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <option value="">Selecione um produto ativo...</option>
              {visibleProducts.map((product) => (
                <option key={product._id} value={product._id}>
                  {product.name} · {getCategoryLabel(product.category)} · {fmt(product.price)}/{saleUnitLabels[product.saleUnit]}
                </option>
              ))}
            </select>
            {selectedProduct && (
              <div className="space-y-3">
                {selectedProduct.saleUnit === 'unit' && (
                  <label className="block text-sm">
                    Quantidade
                    <input type="number" min="1" step="1" value={catalogMeasure.pieceCount} onChange={(event) => setCatalogMeasure({ ...catalogMeasure, pieceCount: event.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2" />
                  </label>
                )}
                {selectedProduct.saleUnit === 'linear_meter' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      Comprimento por peça (m)
                      <input type="number" min="0" step="any" value={catalogMeasure.lengthPerPiece} onChange={(event) => setCatalogMeasure({ ...catalogMeasure, lengthPerPiece: event.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2" />
                    </label>
                    <label className="text-sm">
                      Quantidade de peças
                      <input type="number" min="1" step="1" value={catalogMeasure.pieceCount} onChange={(event) => setCatalogMeasure({ ...catalogMeasure, pieceCount: event.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2" />
                    </label>
                  </div>
                )}
                {selectedProduct.saleUnit === 'kilometer' && (
                  <label className="block text-sm">
                    Distância (km)
                    <input type="number" min="0" step="any" value={catalogMeasure.distanceKm} onChange={(event) => setCatalogMeasure({ ...catalogMeasure, distanceKm: event.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2" />
                  </label>
                )}
                {selectedProduct.saleUnit === 'square_meter' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <label className="text-sm">
                        Largura
                        <input type="number" min="0" step="any" value={catalogMeasure.width} onChange={(event) => setCatalogMeasure({ ...catalogMeasure, width: event.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2" />
                      </label>
                      <label className="text-sm">
                        Altura
                        <input type="number" min="0" step="any" value={catalogMeasure.height} onChange={(event) => setCatalogMeasure({ ...catalogMeasure, height: event.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2" />
                      </label>
                      <label className="text-sm">
                        Medida
                        <select value={catalogMeasure.dimensionUnit} onChange={(event) => setCatalogMeasure({ ...catalogMeasure, dimensionUnit: event.target.value })} className="mt-1 block w-full rounded-lg border bg-white px-3 py-2">
                          <option value="cm">cm</option>
                          <option value="m">m</option>
                        </select>
                      </label>
                      <label className="text-sm">
                        Quantidade de peças
                        <input type="number" min="1" step="1" value={catalogMeasure.pieceCount} onChange={(event) => setCatalogMeasure({ ...catalogMeasure, pieceCount: event.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2" />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
                  <span>
                    Quantidade calculada: <strong>{catalogValid ? catalogQuantity.toFixed(4).replace('.', ',') : '—'} {saleUnitLabels[selectedProduct.saleUnit]}</strong>
                    {' · '}Preço: <strong>{fmt(catalogPricing.unitPrice)}</strong>
                    {' · '}{catalogPricing.minQuantity ? `Faixa a partir de ${catalogPricing.minQuantity}` : 'Preço base'}
                    {' · '}Total: <strong className="text-brand-700">{catalogValid ? fmt(catalogTotal) : '—'}</strong>
                  </span>
                  <button type="button" disabled={!catalogValid} onClick={addCatalogItem} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
                    Adicionar ao pedido
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-12">
                {it.productId ? (
                  <div className="col-span-full flex min-w-0 items-center gap-3 rounded-lg border bg-slate-50 px-3 py-2 sm:col-span-11">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{it.description}</div>
                      <div className="text-xs text-slate-500">
                        {Number(it.quantity).toFixed(4).replace('.', ',')} {saleUnitLabels[it.saleUnit] || ''}
                        {' × '}{fmt(it.unitPrice)}{it.saleUnit ? `/${saleUnitLabels[it.saleUnit]}` : ''}
                        {' · '}{getCategoryLabel(it.category || products.find((product) => product._id === it.productId)?.category)}
                      </div>
                      {['unit', 'kilometer'].includes(it.saleUnit) && <label className="mt-2 block text-xs">{it.saleUnit === 'kilometer' ? 'Distância (km)' : 'Quantidade'}
                        <input type="number" min={it.saleUnit === 'unit' ? '1' : '0.01'} step={it.saleUnit === 'unit' ? '1' : 'any'} value={it.quantity} onChange={(event) => updateItem(idx, 'quantity', event.target.value)} className="ml-2 w-24 rounded border bg-white px-2 py-1" />
                      </label>}
                    </div>
                    <strong className="shrink-0 text-sm">{fmt(itemTotal(it))}</strong>
                  </div>
                ) : (
                  <>
                    <input
                      className="col-span-full min-w-0 rounded-lg border px-3 py-2 text-sm sm:col-span-6"
                      placeholder="Descrição (ex: Banner 2x1m, Adesivo 100un...)"
                      value={it.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    />
                    <input
                      type="number" min="0" step="any"
                      className="col-span-full min-w-0 rounded-lg border px-3 py-2 text-sm sm:col-span-2"
                      placeholder="Qtd"
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    />
                    <input
                      type="number" min="0" step="any"
                      className="col-span-full min-w-0 rounded-lg border px-3 py-2 text-sm sm:col-span-3"
                      placeholder="Preço unit. (R$)"
                      value={it.unitPrice}
                      onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                    />
                    <select
                      aria-label={`Categoria do item ${idx + 1}`}
                      className="col-span-full min-w-0 rounded-lg border px-3 py-2 text-sm sm:col-span-11"
                      value={it.category || ''}
                      onChange={(event) => updateItem(idx, 'category', event.target.value)}
                    >
                      <option value="">Sem categoria</option>
                      {productCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                    </select>
                  </>
                )}
                <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="col-span-full justify-self-end p-2 text-red-500 rounded-lg hover:bg-red-50 sm:col-span-1">
                  <Trash2 size={16} />
                </button>
                <GraphicItemFields item={it} onChange={(field, value) => updateItem(idx, field, value)} />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-6 pt-3 border-t text-sm">
            <div>Subtotal: <strong>{fmt(itemsTotal)}</strong></div>
            <div className="flex items-center gap-2">
              Desconto R$:
              <input type="number" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-24 px-2 py-1 border rounded" />
            </div>
            <div className="text-lg">Total: <strong className="text-brand-600">{fmt(finalValue)}</strong></div>
          </div>
        </div>

        {/* Parcelas */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h2 className="font-semibold">Parcelas</h2>
          <div>
            <label className="text-sm font-medium">Forma de pagamento</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-white">
              <option value="pix">Pix</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="debito">Cartão de débito</option>
              <option value="credito">Cartão de crédito</option>
              <option value="parcelado">Crédito parcelado</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-slate-500">Entrada (R$)</label>
              <input
                type="number"
                min="0"
                max={finalValue}
                step="0.01"
                value={downPayment}
                onChange={(e) => setDownPayment(e.target.value)}
                disabled={orderStatus !== 'pendente'}
                className="block w-32 px-3 py-2 border rounded-lg text-sm disabled:bg-slate-100"
              />
              <p className="text-xs text-slate-400 mt-1">Será registrada como recebida ao aprovar o pedido.</p>
            </div>
            <div>
              <label className="text-xs text-slate-500">Nº de parcelas</label>
              <input type="number" min="1" max="12" value={instCount} onChange={(e) => setInstCount(e.target.value)} className="block w-24 px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500">1º vencimento</label>
              <input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} className="block px-3 py-2 border rounded-lg text-sm" />
            </div>
            <button type="button" onClick={generateInstallments} className="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-900">Gerar parcelas</button>
          </div>
          {installments.length > 0 && (
            <div className="space-y-2">
              {installments.map((p, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 items-center text-sm sm:grid-cols-12">
                  <span className="col-span-full text-slate-500 sm:col-span-2">{i + 1}ª parcela</span>
                  <input type="date" value={p.dueDate} onChange={(e) => { const n = [...installments]; n[i].dueDate = e.target.value; setInstallments(n); }} className="col-span-full min-w-0 px-3 py-2 border rounded-lg sm:col-span-5" />
                  <input type="number" step="any" value={p.amount} onChange={(e) => { const n = [...installments]; n[i].amount = e.target.value; setInstallments(n); }} className="col-span-full min-w-0 px-3 py-2 border rounded-lg sm:col-span-4" />
                  <button type="button" onClick={() => setInstallments(installments.filter((_, x) => x !== i))} className="col-span-full justify-self-end text-red-500 sm:col-span-1"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Entrega e observações */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <div>
            <label className="text-sm font-medium">Data de entrega prevista</label>
            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="mt-1 block px-3 py-2 border rounded-lg text-sm" />
          </div>
          <label className="block text-sm font-medium">Prioridade
            <select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-1 block rounded-lg border bg-white px-3 py-2 text-sm">
              {Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Etapas necessárias neste serviço</legend>
            <div className="flex flex-wrap gap-4">
              {productionStages.filter(([key]) => !['entregue', 'impressao'].includes(key)).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!skippedStages.includes(key)} onChange={(event) => setSkippedStages((current) => updateSkippedStagesForRequirement(current, key, event.target.checked))} />{label}
              </label>)}
            </div>
          </fieldset>
          <div>
            <label className="text-sm font-medium">Observações</label>
            <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows="3" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" placeholder="Instruções de produção, material, acabamento..." />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Fotos e anexos por link</legend>
            <p className="text-xs text-slate-500">Links para foto do local/veículo ou arte aprovada. Os links aparecem no pedido, PDF e WhatsApp.</p>
            {attachments.map((attachment, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input aria-label={`Nome do anexo ${index + 1}`} value={attachment.label || ''} onChange={(event) => setAttachments((current) => current.map((item, row) => row === index ? { ...item, label: event.target.value } : item))} placeholder="Ex.: Fachada atual" className="rounded-lg border px-3 py-2 text-sm" />
                <input aria-label={`Link do anexo ${index + 1}`} type="url" value={attachment.url || ''} onChange={(event) => setAttachments((current) => current.map((item, row) => row === index ? { ...item, url: event.target.value } : item))} placeholder="https://..." className="rounded-lg border px-3 py-2 text-sm" />
                <button type="button" aria-label={`Remover anexo ${index + 1}`} onClick={() => setAttachments((current) => current.filter((_, row) => row !== index))} className="rounded-lg border px-3 py-2 text-sm">Remover</button>
              </div>
            ))}
            <button type="button" onClick={() => setAttachments((current) => [...current, { label: '', url: '' }])} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">Adicionar link</button>
          </fieldset>
        </div>

        <div className="flex justify-end gap-3 pb-6">
          <button type="button" onClick={onCancel || (() => navigate(-1))} className="px-5 py-2.5 border rounded-lg hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium disabled:opacity-50">
            <Save size={16} /> {saving ? 'Salvando...' : isEdit
              ? orderStatus === 'pendente' ? 'Salvar Orçamento' : 'Salvar Pedido'
              : 'Salvar Orçamento'}
          </button>
        </div>
      </form>

      <Modal open={showNewClient} onClose={() => setShowNewClient(false)} title="Cadastrar cliente rápido">
        <div className="max-h-[75vh] space-y-3 overflow-y-auto">
          <input required placeholder="Nome *" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input required placeholder="Telefone/WhatsApp (com DDD) *" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input placeholder="E-mail" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="CPF/CNPJ" value={newClient.document} onChange={(e) => setNewClient({ ...newClient, document: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <input placeholder="Endereço (rua/avenida)" value={newClient.address} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="Número" value={newClient.addressNumber} onChange={(e) => setNewClient({ ...newClient, addressNumber: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input placeholder="Complemento" value={newClient.addressComplement} onChange={(e) => setNewClient({ ...newClient, addressComplement: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="Bairro" value={newClient.neighborhood} onChange={(e) => setNewClient({ ...newClient, neighborhood: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="Cidade" value={newClient.city} onChange={(e) => setNewClient({ ...newClient, city: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="UF" maxLength={2} value={newClient.state} onChange={(e) => setNewClient({ ...newClient, state: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="CEP" value={newClient.zipCode} onChange={(e) => setNewClient({ ...newClient, zipCode: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <input placeholder="Inscrição Estadual" value={newClient.stateRegistration} onChange={(e) => setNewClient({ ...newClient, stateRegistration: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="Contato" value={newClient.contact} onChange={(e) => setNewClient({ ...newClient, contact: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <button onClick={createClient} className="w-full py-2.5 bg-brand-600 text-white rounded-lg font-medium">Cadastrar e selecionar</button>
        </div>
      </Modal>
      <MeasureCalculator
        products={products}
        open={showMeasureCalculator}
        onClose={() => setShowMeasureCalculator(false)}
        onAddItem={(item) => setItems((current) => [...current, item])}
      />
    </div>
  );

  return modal ? (
    <Modal
      open={open}
      onClose={onCancel}
      title={isEdit
        ? `Editar ${getOrderDocumentLabel({ status: orderStatus, amountPaid })}`
        : 'Novo Orçamento'}
      wide
    >
      {content}
    </Modal>
  ) : content;
}
