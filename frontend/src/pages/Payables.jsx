import { useEffect, useState } from 'react';
import { Plus, Trash2, CheckCircle2, AlertTriangle, Bell } from 'lucide-react';
import { api, fmt, fmtDate } from '../api';
import Modal from '../components/Modal.jsx';

const categories = ['consumo', 'insumo', 'aluguel', 'funcionario', 'imposto', 'outro'];
const catLabel = { consumo: 'Conta de consumo', insumo: 'Insumo/Material', aluguel: 'Aluguel', funcionario: 'Funcionário', imposto: 'Imposto', outro: 'Outro' };

export default function Payables() {
  const [items, setItems] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState('open');
  const [form, setForm] = useState({ description: '', category: 'consumo', value: '', dueDate: '', recurring: false, notes: '' });

  const load = () => {
    const q = filter === 'all' ? '' : filter === 'open' ? '?paid=false' : '?paid=true';
    api(`/api/payables${q}`).then(setItems);
  };
  useEffect(() => { load(); }, [filter]);

  const today = new Date();
  const in3 = new Date(today.getTime() + 3 * 86400000);
  const rowStyle = (p) => {
    if (p.paid) return 'bg-emerald-50/50';
    const d = new Date(p.dueDate);
    if (d < today) return 'bg-red-50';
    if (d <= in3) return 'bg-amber-50';
    return '';
  };

  const create = async () => {
    if (!form.description || !form.value || !form.dueDate) return alert('Preencha descrição, valor e vencimento');
    await api('/api/payables', { method: 'POST', body: { ...form, value: Number(form.value), dueDate: new Date(form.dueDate) } });
    setShowNew(false);
    setForm({ description: '', category: 'consumo', value: '', dueDate: '', recurring: false, notes: '' });
    load();
  };

  const pay = async (id) => {
    await api(`/api/payables/${id}/pay`, { method: 'POST' });
    load();
  };

  const remove = async (id) => {
    if (!confirm('Excluir esta conta?')) return;
    await api(`/api/payables/${id}`, { method: 'DELETE' });
    load();
  };

  const totalOpen = items.filter((p) => !p.paid).reduce((s, p) => s + p.value, 0);
  const totalPaid = items.filter((p) => p.paid).reduce((s, p) => s + p.value, 0);
  const totalOverdue = items.filter((p) => !p.paid && new Date(p.dueDate) < today).reduce((s, p) => s + p.value, 0);
  const totalDueSoon = items.filter((p) => !p.paid && new Date(p.dueDate) >= today && new Date(p.dueDate) <= in3).reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contas a Pagar</h1>
          <p className="text-sm text-slate-500">Em aberto: <strong className="text-red-600">{fmt(totalOpen)}</strong></p>
        </div>
        <div className="flex gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-white">
            <option value="open">Em aberto</option>
            <option value="paid">Pagas</option>
            <option value="all">Todas</option>
          </select>
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={16} /> Nova Conta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Em aberto</div>
          <div className="mt-2 text-2xl font-bold text-slate-800">{fmt(totalOpen)}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-rose-700">Vencidas</div>
          <div className="mt-2 text-2xl font-bold text-rose-700">{fmt(totalOverdue)}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-amber-700">Próximo vencimento</div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{fmt(totalDueSoon)}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-emerald-700">Pagas</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{fmt(totalPaid)}</div>
        </div>
      </div>

      <div className="flex gap-3 text-xs flex-wrap">
        <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle size={12} /> Vencida</span>
        <span className="inline-flex items-center gap-1 text-amber-600"><Bell size={12} /> Vence em até 3 dias</span>
        <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={12} /> Paga</span>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3">Descrição</th>
              <th className="text-left px-5 py-3">Categoria</th>
              <th className="text-left px-5 py-3">Vencimento</th>
              <th className="text-right px-5 py-3">Valor</th>
              <th className="text-center px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan="6" className="text-center py-10 text-slate-400">Nenhuma conta cadastrada.</td></tr>}
            {items.map((p) => (
              <tr key={p._id} className={`border-t ${rowStyle(p)}`}>
                <td className="px-5 py-3">
                  {p.description}
                  {p.recurring && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">recorrente</span>}
                </td>
                <td className="px-5 py-3 text-slate-500">{catLabel[p.category] || p.category}</td>
                <td className="px-5 py-3">{fmtDate(p.dueDate)}</td>
                <td className="px-5 py-3 text-right font-semibold">{fmt(p.value)}</td>
                <td className="px-5 py-3 text-center">
                  {p.paid
                    ? <span className="text-xs font-semibold text-emerald-600">PAGA em {fmtDate(p.paidAt)}</span>
                    : new Date(p.dueDate) < today
                      ? <span className="text-xs font-semibold text-red-600">VENCIDA</span>
                      : <span className="text-xs text-slate-500">aberta</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex gap-2">
                    {!p.paid && <button onClick={() => pay(p._id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs hover:bg-emerald-600"><CheckCircle2 size={12} /> Pagar</button>}
                    <button onClick={() => remove(p._id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Cadastrar conta a pagar">
        <div className="space-y-3">
          <input placeholder="Descrição (ex: Conta de energia, Aluguel, Bobina de vinil...)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
            {categories.map((c) => <option key={c} value={c}>{catLabel[c]}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" step="any" placeholder="Valor R$" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} /> Conta recorrente (mensal)
          </label>
          <textarea placeholder="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows="2" className="w-full px-3 py-2 border rounded-lg text-sm" />
          <button onClick={create} className="w-full py-2.5 bg-brand-600 text-white rounded-lg font-medium">Cadastrar</button>
        </div>
      </Modal>
    </div>
  );
}
