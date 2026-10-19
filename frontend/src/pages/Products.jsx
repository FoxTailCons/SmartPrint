import { useState } from 'react';
import { Edit2, Package, Plus, Search, X } from 'lucide-react';
import { api, fmt } from '../api';
import Modal from '../components/Modal.jsx';
import ListSkeleton from '../components/ListSkeleton.jsx';
import Pagination from '../components/Pagination.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getListState } from '../hooks/listState.js';
import { useServerPagination } from '../hooks/useServerPagination.js';

const saleUnits = [
  { value: 'unit', label: 'Unidade' },
  { value: 'linear_meter', label: 'Metro linear' },
  { value: 'square_meter', label: 'Metro quadrado (m²)' },
];
const emptyForm = { name: '', code: '', saleUnit: 'unit', price: '', active: true };
const PAGE_SIZE = 20;
const unitLabel = (value) => saleUnits.find((unit) => unit.value === value)?.label || value;

export default function Products() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (isAdmin && includeInactive) params.set('includeInactive', 'true');
  const list = useServerPagination('/api/products', params.toString(), page, PAGE_SIZE);
  const { items: products, total, loading, error: listError, retry } = list;
  const listState = getListState({ loading, error: listError, items: products });

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const edit = (product) => {
    setEditingId(product._id);
    setForm({
      name: product.name,
      code: product.code || '',
      saleUnit: product.saleUnit,
      price: String(product.price),
      active: product.active,
    });
    setFormOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form, price: Number(form.price) };
      await api(editingId ? `/api/products/${editingId}` : '/api/products', {
        method: editingId ? 'PUT' : 'POST',
        body,
      });
      closeForm();
      retry();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (product) => {
    setError('');
    try {
      if (product.active) {
        await api(`/api/products/${product._id}/deactivate`, { method: 'PATCH' });
      } else {
        await api(`/api/products/${product._id}`, {
          method: 'PUT',
          body: {
            name: product.name,
            code: product.code || '',
            saleUnit: product.saleUnit,
            price: product.price,
            active: true,
          },
        });
      }
      retry();
    } catch (updateError) {
      setError(updateError.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-slate-500">Catálogo e preços por unidade de venda</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => { setForm(emptyForm); setEditingId(null); setFormOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus size={16} /> Novo produto
          </button>
        )}
      </div>

      <form
        onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }}
        className="flex max-w-2xl flex-wrap items-center gap-3"
      >
        <div className="relative min-w-56 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Buscar por nome ou código..."
            className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button type="submit" className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50">Buscar</button>
        {isAdmin && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={includeInactive} onChange={(event) => { setPage(1); setIncludeInactive(event.target.checked); }} />
            Incluir inativos
          </label>
        )}
      </form>

      {(error || listError) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error || listError}
        {listError && <button type="button" onClick={retry} className="ml-3 underline">Tentar novamente</button>}
      </div>}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        {listState === 'loading' ? (
          <ListSkeleton variant="list" rows={6} />
        ) : listState === 'error' ? (
          <div className="p-8 text-center text-sm text-red-700">
            <p>{listError || error}</p>
            <button type="button" onClick={retry} className="mt-2 rounded-lg border px-3 py-1.5 hover:bg-red-50">Tentar novamente</button>
          </div>
        ) : listState === 'empty' ? (
          <div className="p-8 text-center text-sm text-slate-400">Nenhum produto encontrado.</div>
        ) : (
          <div className="divide-y">
            {products.map((product) => (
              <div key={product._id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                  <Package size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{product.name}</div>
                  <div className="text-xs text-slate-500">
                    {product.code ? `${product.code} · ` : ''}{unitLabel(product.saleUnit)}
                    {!product.active && <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-slate-500">Inativo</span>}
                  </div>
                </div>
                <div className="font-semibold">{fmt(product.price)} <span className="text-xs font-normal text-slate-500">/ {product.saleUnit === 'unit' ? 'un.' : product.saleUnit === 'linear_meter' ? 'm' : 'm²'}</span></div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => edit(product)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs hover:bg-slate-50">
                      <Edit2 size={14} /> Editar
                    </button>
                    <button type="button" onClick={() => toggleActive(product)} className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50">
                      {product.active ? 'Desativar' : 'Reativar'}
                    </button>
                  </div>
                )}
                <Pagination page={list.page} pageSize={list.pageSize} total={total} onPageChange={setPage} />
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={formOpen} onClose={closeForm} title={editingId ? 'Editar produto' : 'Novo produto'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Nome</label>
            <input required autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Código <span className="font-normal text-slate-500">(opcional)</span></label>
            <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Unidade de venda</label>
            <select value={form.saleUnit} onChange={(event) => setForm({ ...form, saleUnit: event.target.value })} className="w-full rounded-lg border bg-white px-3 py-2 text-sm">
              {saleUnits.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Preço por {form.saleUnit === 'unit' ? 'unidade' : form.saleUnit === 'linear_meter' ? 'metro linear' : 'metro quadrado (m²)'}</label>
            <input required type="number" min="0" step="any" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          {editingId && (
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              Produto ativo
            </label>
          )}
          {error && <div role="alert" className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeForm} className="inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"><X size={14} /> Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar produto'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
