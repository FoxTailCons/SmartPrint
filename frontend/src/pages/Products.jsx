import { useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { api, fmt } from '../api';
import Modal from '../components/Modal.jsx';
import ListSkeleton from '../components/ListSkeleton.jsx';
import ProductList from '../components/ProductList.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getListState } from '../hooks/listState.js';
import { useServerPagination } from '../hooks/useServerPagination.js';
import { parsePriceTiers } from './catalogPricing.js';
import { productCategories } from './printshop.js';

const saleUnits = [
  { value: 'unit', label: 'Unidade' },
  { value: 'linear_meter', label: 'Metro linear' },
  { value: 'square_meter', label: 'Metro quadrado (m²)' },
  { value: 'kilometer', label: 'Quilômetro (km)' },
];
const emptyForm = { name: '', code: '', saleUnit: 'unit', price: '', costPrice: '', category: '', imageUrl: '', active: true, priceTiers: [] };
const PAGE_SIZE = 20;
const suggestedServices = [
  { name: 'Instalação de fachada', saleUnit: 'unit' },
  { name: 'Envelopamento parcial', saleUnit: 'unit' },
  { name: 'Envelopamento total', saleUnit: 'unit' },
  { name: 'Deslocamento', saleUnit: 'kilometer' },
];

export default function Products() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (category) params.set('category', category);
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
      costPrice: product.costPrice ?? '',
      imageUrl: product.imageUrl || '',
      category: product.category || '',
      active: product.active,
      priceTiers: (product.priceTiers || []).map((tier) => ({ minQuantity: String(tier.minQuantity), price: String(tier.price) })),
    });
    setFormOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const price = Number(form.price);
      if (form.price.trim() === '' || !Number.isFinite(price) || price < 0) throw new Error('Informe um preço válido, maior ou igual a zero.');
      const costPrice = form.costPrice === '' ? undefined : Number(form.costPrice);
      if (costPrice !== undefined && (!Number.isFinite(costPrice) || costPrice < 0)) throw new Error('Informe um custo válido, maior ou igual a zero.');
      const body = { ...form, price, costPrice: costPrice ?? null, priceTiers: parsePriceTiers(form.priceTiers) };
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
            costPrice: product.costPrice,
            imageUrl: product.imageUrl || '',
            priceTiers: product.priceTiers || [],
            category: product.category || '',
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
        <select aria-label="Filtrar por categoria" value={category} onChange={(event) => { setPage(1); setCategory(event.target.value); }} className="rounded-lg border bg-white px-3 py-2 text-sm">
          <option value="">Todas as categorias</option>
          <option value="sem_categoria">Sem categoria</option>
          {productCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
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
          <ProductList
            products={products}
            isAdmin={isAdmin}
            page={list.page}
            pageSize={list.pageSize}
            total={total}
            onPageChange={setPage}
            onEdit={edit}
            onToggleActive={toggleActive}
          />
        )}
      </div>

      <Modal open={formOpen} onClose={closeForm} title={editingId ? 'Editar produto' : 'Novo produto'}>
        <form onSubmit={save} className="space-y-4">
          {!editingId && <label className="block text-sm font-medium">Sugestão de serviço
            <select value={suggestedServices.some((item) => item.name === form.name) ? form.name : ''} onChange={(event) => {
              const service = suggestedServices.find((item) => item.name === event.target.value);
              if (service) setForm((current) => ({ ...current, ...service, category: 'servicos_instalacao' }));
            }} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
              <option value="">Produto personalizado</option>
              {suggestedServices.map((service) => <option key={service.name} value={service.name}>{service.name}</option>)}
            </select>
          </label>}
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
            <label className="mb-1 block text-sm font-medium">Categoria</label>
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="w-full rounded-lg border bg-white px-3 py-2 text-sm">
              <option value="">Sem categoria</option>
              {productCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Preço por {form.saleUnit === 'unit' ? 'unidade' : form.saleUnit === 'linear_meter' ? 'metro linear' : form.saleUnit === 'kilometer' ? 'quilômetro' : 'metro quadrado (m²)'}</label>
            <input required type="number" min="0" step="any" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Custo por {form.saleUnit === 'unit' ? 'unidade' : form.saleUnit === 'linear_meter' ? 'metro linear' : form.saleUnit === 'kilometer' ? 'quilômetro' : 'metro quadrado (m²)'} <span className="font-normal text-slate-500">(opcional)</span></label>
            <input type="number" min="0" step="any" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
            {form.costPrice !== '' && Number(form.price) > 0 && <p className="mt-1 text-xs text-slate-500">Margem bruta estimada: {(((Number(form.price) - Number(form.costPrice)) / Number(form.price)) * 100).toFixed(1).replace('.', ',')}%</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Link da imagem de referência <span className="font-normal text-slate-500">(opcional)</span></label>
            <input type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Preços por quantidade</legend>
            <p className="text-xs text-slate-500">O mínimo é inclusivo: acima de 20 unidades significa mínimo 21. Sem faixa aplicável, vale o preço base.</p>
            {form.priceTiers.map((tier, index) => (
              <div key={index} className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-sm">Mínimo
                  <input aria-label={`Mínimo da faixa ${index + 1}`} required type="number" min="0" step="any" value={tier.minQuantity} onChange={(event) => setForm({ ...form, priceTiers: form.priceTiers.map((row, rowIndex) => rowIndex === index ? { ...row, minQuantity: event.target.value } : row) })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
                <label className="min-w-0 flex-1 text-sm">Preço
                  <input aria-label={`Preço da faixa ${index + 1}`} required type="number" min="0" step="any" value={tier.price} onChange={(event) => setForm({ ...form, priceTiers: form.priceTiers.map((row, rowIndex) => rowIndex === index ? { ...row, price: event.target.value } : row) })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
                <button type="button" aria-label={`Remover faixa ${index + 1}`} onClick={() => setForm({ ...form, priceTiers: form.priceTiers.filter((_, rowIndex) => rowIndex !== index) })} className="rounded-lg border p-2.5"><X size={16} /></button>
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, priceTiers: [...form.priceTiers, { minQuantity: '', price: '' }] })} className="rounded-lg border px-3 py-2 text-sm">Adicionar faixa</button>
          </fieldset>
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
