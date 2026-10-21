import { useState } from 'react';
import { Plus, Trash2, CheckCircle2, AlertTriangle, Bell } from 'lucide-react';
import { api, fmt, fmtCivilDate, fmtDate } from '../api';
import { calendarDate, getSaoPauloDateKey } from '../dateUtils.js';
import Modal from '../components/Modal.jsx';
import ListSkeleton from '../components/ListSkeleton.jsx';
import Pagination from '../components/Pagination.jsx';
import { getListState } from '../hooks/listState.js';
import { useServerPagination } from '../hooks/useServerPagination.js';
import PeriodExport from '../components/PeriodExport.jsx';
import ThermalPrintButton from '../components/ThermalPrintButton.jsx';
import { buildPayableThermalHtml } from './thermalPrint.js';

const categories = ['consumo', 'insumo', 'aluguel', 'funcionario', 'imposto', 'outro'];
const DEFAULT_PAGE_SIZE = 20;
const catLabel = { consumo: 'Conta de consumo', insumo: 'Insumo/Material', aluguel: 'Aluguel', funcionario: 'Funcionário', imposto: 'Imposto', outro: 'Outro' };

export default function Payables() {
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState('open');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [actionError, setActionError] = useState('');
  const [form, setForm] = useState({ description: '', category: 'consumo', value: '', dueDate: '', recurring: false, notes: '' });
  const filters = filter === 'all' ? '' : `paid=${filter === 'paid'}`;
  const list = useServerPagination('/api/payables', filters, page, pageSize);
  const { items, total, summary, loading, error, retry } = list;
  const listState = getListState({ loading, error, items });

  const today = getSaoPauloDateKey();
  const in3 = new Date(`${today}T00:00:00.000Z`);
  in3.setUTCDate(in3.getUTCDate() + 3);
  const dueSoonThrough = in3.toISOString().slice(0, 10);
  const rowStyle = (p) => {
    if (p.paid) return 'bg-emerald-50/50';
    const dueDate = calendarDate(p.dueDate);
    if (!dueDate) return '';
    if (dueDate < today) return 'bg-red-50';
    if (dueDate <= dueSoonThrough) return 'bg-amber-50';
    return '';
  };

  const create = async () => {
    if (!form.description || !form.value || !form.dueDate) return alert('Preencha descrição, valor e vencimento');
    try {
      await api('/api/payables', { method: 'POST', body: { ...form, value: Number(form.value), dueDate: new Date(form.dueDate) } });
      setShowNew(false);
      setForm({ description: '', category: 'consumo', value: '', dueDate: '', recurring: false, notes: '' });
      setActionError('');
      retry();
    } catch (error) {
      setActionError(error.message);
    }
  };

  const pay = async (id) => {
    try {
      await api(`/api/payables/${id}/pay`, { method: 'POST' });
      setActionError('');
      retry();
    } catch (error) {
      setActionError(error.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Excluir esta conta?')) return;
    try {
      await api(`/api/payables/${id}`, { method: 'DELETE' });
      setActionError('');
      retry();
    } catch (error) {
      setActionError(error.message);
    }
  };

  const totalOpen = summary?.totalOpen || 0;
  const totalPaid = summary?.totalPaid || 0;
  const totalOverdue = summary?.totalOverdue || 0;
  const totalDueSoon = summary?.totalDueSoon || 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contas a Pagar</h1>
          <p className="text-sm text-slate-500">{total} conta(s) · Em aberto: <strong className="text-red-600">{fmt(totalOpen)}</strong></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PeriodExport type="finance" label="Exportar financeiro CSV" />
          <select value={filter} onChange={(e) => { setPage(1); setFilter(e.target.value); }} className="px-3 py-2 border rounded-lg text-sm bg-white">
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

      {actionError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
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
            {listState === 'loading' && <tr><td colSpan="6"><ListSkeleton variant="table" rows={6} /></td></tr>}
            {listState === 'error' && <tr><td colSpan="6" className="py-8 text-center text-sm text-red-700">
              <div role="alert">{error}</div>
              <button type="button" onClick={retry} className="mt-2 rounded-lg border px-3 py-1.5 hover:bg-red-50">Tentar novamente</button>
            </td></tr>}
            {listState === 'empty' && <tr><td colSpan="6" className="text-center py-10 text-slate-400">Nenhuma conta cadastrada.</td></tr>}
            {listState === 'ready' && items.map((p) => (
              <tr key={p._id} className={`border-t ${rowStyle(p)}`}>
                <td className="px-5 py-3">
                  {p.description}
                  {p.recurring && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">recorrente</span>}
                </td>
                <td className="px-5 py-3 text-slate-500">{catLabel[p.category] || p.category}</td>
                <td className="px-5 py-3">{fmtCivilDate(p.dueDate)}</td>
                <td className="px-5 py-3 text-right font-semibold">{fmt(p.value)}</td>
                <td className="px-5 py-3 text-center">
                  {p.paid
                    ? <span className="text-xs font-semibold text-emerald-600">PAGA em {fmtDate(p.paidAt)}</span>
                    : calendarDate(p.dueDate) && calendarDate(p.dueDate) < today
                      ? <span className="text-xs font-semibold text-red-600">VENCIDA</span>
                      : <span className="text-xs text-slate-500">aberta</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex gap-2">
                    {!p.paid && <ThermalPrintButton html={buildPayableThermalHtml(p)} label="Pendência 80 mm" className="!py-1.5 !px-2.5 text-xs" />}
                    {!p.paid && <button onClick={() => pay(p._id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs hover:bg-emerald-600"><CheckCircle2 size={12} /> Pagar</button>}
                    <button onClick={() => remove(p._id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination page={list.page} pageSize={list.pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} />
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
