import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Plus, Trash2, Save, UserPlus, Ruler } from 'lucide-react';
import { api, fmt } from '../api';
import Modal from '../components/Modal.jsx';
import MeasureCalculator from '../components/MeasureCalculator.jsx';
import { calculateAreaPerPiece } from './measurements.js';

const emptyItem = { description: '', quantity: 1, unitPrice: 0, total: 0 };
const emptyCatalogMeasure = {
  pieceCount: '1',
  lengthPerPiece: '',
  width: '',
  height: '',
  dimensionUnit: 'cm',
  moldEnabled: false,
  moldFactor: '1',
};
const saleUnitLabels = { unit: 'un.', linear_meter: 'm', square_meter: 'm²' };

export default function OrderForm({ modal = false, open = true, onSaved, onCancel }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogProductId, setCatalogProductId] = useState('');
  const [catalogMeasure, setCatalogMeasure] = useState(emptyCatalogMeasure);
  const [clientId, setClientId] = useState('');
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [observations, setObservations] = useState('');
  const [installments, setInstallments] = useState([]); // {dueDate, amount}
  const [instCount, setInstCount] = useState(1);
  const [firstDue, setFirstDue] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [showMeasureCalculator, setShowMeasureCalculator] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/api/clients').then(setClients);
    api('/api/products').then(setProducts).catch((error) => setCatalogError(error.message));
    if (isEdit) {
      api(`/api/orders/${id}`).then((o) => {
        setClientId(o.client?._id || o.client);
        setItems(o.items?.length ? o.items : [{ ...emptyItem }]);
        setDiscount(o.discount || 0);
        setPaymentMethod(o.paymentMethod || 'pix');
        setDeliveryDate(o.deliveryDate ? new Date(o.deliveryDate).toISOString().slice(0, 10) : '');
        setObservations(o.observations || '');
        setInstallments(o.installments?.map((p) => ({ dueDate: new Date(p.dueDate).toISOString().slice(0, 10), amount: p.amount })) || []);
      });
    }
  }, [id]);

  const itemsTotal = items.reduce((s, i) => s + (Number(i.quantity) * Number(i.unitPrice) || 0), 0);
  const finalValue = Math.max(0, itemsTotal - Number(discount || 0));
  const selectedProduct = products.find((product) => product._id === catalogProductId);
  const pieceCount = Number(catalogMeasure.pieceCount);
  const lengthPerPiece = Number(catalogMeasure.lengthPerPiece);
  const width = Number(catalogMeasure.width);
  const height = Number(catalogMeasure.height);
  let catalogQuantity = 0;
  let catalogValid = false;

  if (selectedProduct?.saleUnit === 'unit') {
    catalogQuantity = pieceCount;
    catalogValid = Number.isInteger(pieceCount) && pieceCount > 0;
  } else if (selectedProduct?.saleUnit === 'linear_meter') {
    catalogQuantity = pieceCount * lengthPerPiece;
    catalogValid = Number.isInteger(pieceCount) && pieceCount > 0 && Number.isFinite(lengthPerPiece) && lengthPerPiece > 0;
  } else if (selectedProduct?.saleUnit === 'square_meter') {
    const moldFactor = Number(catalogMeasure.moldFactor);
    const moldValid = !catalogMeasure.moldEnabled || (Number.isFinite(moldFactor) && moldFactor > 0);
    const areaPerPiece = calculateAreaPerPiece({
      width,
      height,
      unit: catalogMeasure.dimensionUnit,
      moldEnabled: catalogMeasure.moldEnabled,
      moldFactor,
    });
    catalogQuantity = areaPerPiece * pieceCount;
    catalogValid = Number.isInteger(pieceCount) && pieceCount > 0
      && Number.isFinite(width) && width > 0
      && Number.isFinite(height) && height > 0
      && moldValid
      && Number.isFinite(catalogQuantity);
  }
  const catalogTotal = selectedProduct ? catalogQuantity * selectedProduct.price : 0;
  catalogValid = catalogValid && Number.isFinite(catalogTotal);

  const updateItem = (idx, field, val) => {
    const next = [...items];
    next[idx][field] = val;
    next[idx].total = Number(next[idx].quantity) * Number(next[idx].unitPrice) || 0;
    setItems(next);
  };

  const addCatalogItem = () => {
    if (!selectedProduct || !catalogValid) return;
    const count = pieceCount;
    const measurements = selectedProduct.saleUnit === 'unit'
      ? { pieceCount: count }
      : selectedProduct.saleUnit === 'linear_meter'
        ? { pieceCount: count, lengthPerPiece }
        : {
          pieceCount: count,
          width,
          height,
          dimensionUnit: catalogMeasure.dimensionUnit,
          moldEnabled: catalogMeasure.moldEnabled,
          moldFactor: catalogMeasure.moldEnabled ? Number(catalogMeasure.moldFactor) : undefined,
        };
    const description = selectedProduct.saleUnit === 'unit'
      ? selectedProduct.name
      : selectedProduct.saleUnit === 'linear_meter'
        ? `${selectedProduct.name} - ${lengthPerPiece} m x ${count} peça(s)`
        : `${selectedProduct.name} - ${width} x ${height} ${catalogMeasure.dimensionUnit} - ${count} peça(s)`;
    setItems((current) => [...current, {
      productId: selectedProduct._id,
      productName: selectedProduct.name,
      saleUnit: selectedProduct.saleUnit,
      description,
      quantity: catalogQuantity,
      unitPrice: selectedProduct.price,
      total: catalogTotal,
      measurements,
    }]);
    setCatalogProductId('');
    setCatalogMeasure(emptyCatalogMeasure);
  };

  const generateInstallments = () => {
    const n = Math.max(1, Number(instCount) || 1);
    const each = finalValue / n;
    const start = firstDue ? new Date(firstDue) : new Date();
    const arr = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      arr.push({ dueDate: d.toISOString().slice(0, 10), amount: Number(each.toFixed(2)) });
    }
    setInstallments(arr);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        client: clientId || null,
        items: items
          .filter((i) => i.productId || i.description?.trim())
          .map((item) => item.productId
            ? {
              ...(item._id ? { _id: item._id } : {}),
              productId: item.productId,
              quantity: item.quantity,
              measurements: item.measurements,
            }
            : item),
        discount: Number(discount) || 0,
        paymentMethod,
        deliveryDate: deliveryDate || undefined,
        observations,
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
      setNewClient({ name: '', phone: '', email: '' });
    } catch (e) { alert(e.message); }
  };

  const content = (
    <div className="space-y-5 max-w-4xl">
      {!modal && <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? 'Editar Pedido' : 'Novo Orçamento / Pedido'}</h1>
          <p className="text-sm text-slate-500">Grandes formatos · Adesivagem · SmartPrint Lindóia</p>
        </div>
        <Link to="/pedidos" className="text-sm text-slate-500 hover:underline">← Voltar</Link>
      </div>}

      <form onSubmit={save} className="space-y-5">
        {/* Cliente */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h2 className="font-semibold">Cliente</h2>
          <div className="flex gap-2">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="flex-1 px-3 py-2.5 border rounded-lg text-sm bg-white"
            >
              <option value="">Sem cliente cadastrado / orçar para pessoa física</option>
              {clients.map((c) => <option key={c._id} value={c._id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
            </select>
            <button type="button" onClick={() => setShowNewClient(true)} className="inline-flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm hover:bg-slate-50">
              <UserPlus size={16} /> Novo
            </button>
          </div>
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
            <select
              id="catalog-product"
              value={catalogProductId}
              onChange={(event) => setCatalogProductId(event.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <option value="">Selecione um produto ativo...</option>
              {products.map((product) => (
                <option key={product._id} value={product._id}>
                  {product.name} · {fmt(product.price)}/{saleUnitLabels[product.saleUnit]}
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
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={catalogMeasure.moldEnabled} onChange={(event) => setCatalogMeasure({ ...catalogMeasure, moldEnabled: event.target.checked })} />
                        Aplicar fator de molde
                      </label>
                      {catalogMeasure.moldEnabled && (
                        <label className="text-sm">
                          Fator
                          <input type="number" min="0" step="any" value={catalogMeasure.moldFactor} onChange={(event) => setCatalogMeasure({ ...catalogMeasure, moldFactor: event.target.value })} className="ml-2 w-24 rounded-lg border px-2 py-1.5" />
                        </label>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
                  <span>
                    Quantidade calculada: <strong>{catalogValid ? catalogQuantity.toFixed(4).replace('.', ',') : '—'} {saleUnitLabels[selectedProduct.saleUnit]}</strong>
                    {' · '}Preço: <strong>{fmt(selectedProduct.price)}</strong>
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
              <div key={idx} className="grid grid-cols-12 items-center gap-2">
                {it.productId ? (
                  <div className="col-span-11 flex min-w-0 items-center gap-3 rounded-lg border bg-slate-50 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{it.description}</div>
                      <div className="text-xs text-slate-500">
                        {Number(it.quantity).toFixed(4).replace('.', ',')} {saleUnitLabels[it.saleUnit] || ''}
                        {' × '}{fmt(it.unitPrice)}{it.saleUnit ? `/${saleUnitLabels[it.saleUnit]}` : ''}
                      </div>
                    </div>
                    <strong className="shrink-0 text-sm">{fmt(Number(it.quantity) * Number(it.unitPrice))}</strong>
                  </div>
                ) : (
                  <>
                    <input
                      className="col-span-6 rounded-lg border px-3 py-2 text-sm"
                      placeholder="Descrição (ex: Banner 2x1m, Adesivo 100un...)"
                      value={it.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    />
                    <input
                      type="number" min="0" step="any"
                      className="col-span-2 rounded-lg border px-3 py-2 text-sm"
                      placeholder="Qtd"
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                    />
                    <input
                      type="number" min="0" step="any"
                      className="col-span-3 rounded-lg border px-3 py-2 text-sm"
                      placeholder="Preço unit. (R$)"
                      value={it.unitPrice}
                      onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                    />
                  </>
                )}
                <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="col-span-1 text-red-500 hover:bg-red-50 p-2 rounded-lg">
                  <Trash2 size={16} />
                </button>
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

        {/* Parcelamento / desdobramento de pagamento */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h2 className="font-semibold">Desdobramento de Pagamento (Parcelas)</h2>
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
                <div key={i} className="grid grid-cols-12 gap-2 items-center text-sm">
                  <span className="col-span-2 text-slate-500">{i + 1}ª parcela</span>
                  <input type="date" value={p.dueDate} onChange={(e) => { const n = [...installments]; n[i].dueDate = e.target.value; setInstallments(n); }} className="col-span-5 px-3 py-2 border rounded-lg" />
                  <input type="number" step="any" value={p.amount} onChange={(e) => { const n = [...installments]; n[i].amount = e.target.value; setInstallments(n); }} className="col-span-4 px-3 py-2 border rounded-lg" />
                  <button type="button" onClick={() => setInstallments(installments.filter((_, x) => x !== i))} className="col-span-1 text-red-500"><Trash2 size={14} /></button>
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
          <div>
            <label className="text-sm font-medium">Observações</label>
            <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows="3" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" placeholder="Instruções de produção, material, acabamento..." />
          </div>
        </div>

        <div className="flex justify-end gap-3 pb-6">
          <button type="button" onClick={onCancel || (() => navigate(-1))} className="px-5 py-2.5 border rounded-lg hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium disabled:opacity-50">
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Pedido'}
          </button>
        </div>
      </form>

      <Modal open={showNewClient} onClose={() => setShowNewClient(false)} title="Cadastrar cliente rápido">
        <div className="space-y-3">
          <input required placeholder="Nome *" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input required placeholder="Telefone/WhatsApp (com DDD) *" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="E-mail" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <button onClick={createClient} className="w-full py-2.5 bg-brand-600 text-white rounded-lg font-medium">Cadastrar e selecionar</button>
        </div>
      </Modal>
      <MeasureCalculator
        open={showMeasureCalculator}
        onClose={() => setShowMeasureCalculator(false)}
        onAddItem={(item) => setItems((current) => [...current, item])}
      />
    </div>
  );

  return modal ? <Modal open={open} onClose={onCancel} title={isEdit ? 'Editar Pedido' : 'Novo Orçamento / Pedido'} wide>{content}</Modal> : content;
}
