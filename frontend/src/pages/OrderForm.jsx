import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Plus, Trash2, Save, UserPlus } from 'lucide-react';
import { api, fmt } from '../api';
import Modal from '../components/Modal.jsx';

const emptyItem = { description: '', quantity: 1, unitPrice: 0, total: 0 };

export default function OrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [discount, setDiscount] = useState(0);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [observations, setObservations] = useState('');
  const [installments, setInstallments] = useState([]); // {dueDate, amount}
  const [instCount, setInstCount] = useState(1);
  const [firstDue, setFirstDue] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/api/clients').then(setClients);
    if (isEdit) {
      api(`/api/orders/${id}`).then((o) => {
        setClientId(o.client?._id || o.client);
        setItems(o.items?.length ? o.items : [{ ...emptyItem }]);
        setDiscount(o.discount || 0);
        setDeliveryDate(o.deliveryDate ? new Date(o.deliveryDate).toISOString().slice(0, 10) : '');
        setObservations(o.observations || '');
        setInstallments(o.installments?.map((p) => ({ dueDate: new Date(p.dueDate).toISOString().slice(0, 10), amount: p.amount })) || []);
      });
    }
  }, [id]);

  const itemsTotal = items.reduce((s, i) => s + (Number(i.quantity) * Number(i.unitPrice) || 0), 0);
  const finalValue = Math.max(0, itemsTotal - Number(discount || 0));

  const updateItem = (idx, field, val) => {
    const next = [...items];
    next[idx][field] = val;
    next[idx].total = Number(next[idx].quantity) * Number(next[idx].unitPrice) || 0;
    setItems(next);
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
    if (!clientId) return alert('Selecione um cliente');
    setSaving(true);
    try {
      const body = {
        client: clientId,
        items: items.filter((i) => i.description),
        discount: Number(discount) || 0,
        deliveryDate: deliveryDate || undefined,
        observations,
        installments: installments.map((p) => ({ ...p, dueDate: new Date(p.dueDate) })),
      };
      const saved = isEdit
        ? await api(`/api/orders/${id}`, { method: 'PUT', body })
        : await api('/api/orders', { method: 'POST', body });
      navigate(`/pedidos/${saved._id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createClient = async () => {
    if (!newClient.name) return alert('Informe o nome do cliente');
    const c = await api('/api/clients', { method: 'POST', body: newClient });
    setClients([...clients, c]);
    setClientId(c._id);
    setShowNewClient(false);
    setNewClient({ name: '', phone: '', email: '' });
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? 'Editar Pedido' : 'Novo Orçamento / Pedido'}</h1>
          <p className="text-sm text-slate-500">Grandes formatos · Adesivagem · SmartPrint Lindóia</p>
        </div>
        <Link to="/pedidos" className="text-sm text-slate-500 hover:underline">← Voltar</Link>
      </div>

      <form onSubmit={save} className="space-y-5">
        {/* Cliente */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h2 className="font-semibold">Cliente</h2>
          <div className="flex gap-2">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="flex-1 px-3 py-2.5 border rounded-lg text-sm bg-white"
              required
            >
              <option value="">Selecione o cliente...</option>
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
            <button type="button" onClick={() => setItems([...items, { ...emptyItem }])} className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
              <Plus size={14} /> Adicionar item
            </button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  className="col-span-6 px-3 py-2 border rounded-lg text-sm"
                  placeholder="Descrição (ex: Banner 2x1m, Adesivo 100un...)"
                  value={it.description}
                  onChange={(e) => updateItem(idx, 'description', e.target.value)}
                />
                <input
                  type="number" min="0" step="any"
                  className="col-span-2 px-3 py-2 border rounded-lg text-sm"
                  placeholder="Qtd"
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                />
                <input
                  type="number" min="0" step="any"
                  className="col-span-3 px-3 py-2 border rounded-lg text-sm"
                  placeholder="Preço unit. (R$)"
                  value={it.unitPrice}
                  onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                />
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
          <button type="button" onClick={() => navigate(-1)} className="px-5 py-2.5 border rounded-lg hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium disabled:opacity-50">
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Pedido'}
          </button>
        </div>
      </form>

      <Modal open={showNewClient} onClose={() => setShowNewClient(false)} title="Cadastrar cliente rápido">
        <div className="space-y-3">
          <input placeholder="Nome *" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="Telefone/WhatsApp (com DDD)" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="E-mail" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <button onClick={createClient} className="w-full py-2.5 bg-brand-600 text-white rounded-lg font-medium">Cadastrar e selecionar</button>
        </div>
      </Modal>
    </div>
  );
}
