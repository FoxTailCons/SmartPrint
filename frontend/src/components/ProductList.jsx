import { Edit2, Package } from 'lucide-react';
import { fmt } from '../api';
import Pagination from './Pagination.jsx';
import { getQuantityPrice } from '../pages/catalogPricing.js';
import { getCategoryLabel } from '../pages/printshop.js';

const unitLabel = (value) => ({
  unit: 'Unidade',
  linear_meter: 'Metro linear',
  square_meter: 'Metro quadrado (m²)',
  kilometer: 'Quilômetro (km)',
}[value] || value);

export default function ProductList({ products, isAdmin, page, pageSize, total, onPageChange, onPageSizeChange, onEdit, onToggleActive }) {
  return (
    <>
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
      <div className="divide-y">
        {products.map((product) => (
          <div key={product._id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
              {product.imageUrl ? <img src={product.imageUrl} alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-full object-cover" /> : <Package size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{product.name}</div>
              {(product.priceTiers || []).slice().sort((a, b) => a.minQuantity - b.minQuantity).map((tier) => (
                <div key={tier.minQuantity} className="text-xs text-slate-600">A partir de {tier.minQuantity}: {fmt(getQuantityPrice(product, tier.minQuantity).unitPrice)}</div>
              ))}
              <div className="text-xs text-slate-500">
                {product.code ? `${product.code} · ` : ''}{unitLabel(product.saleUnit)} · {getCategoryLabel(product.category)}
                {!product.active && <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-slate-500">Inativo</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold">{fmt(product.price)} <span className="text-xs font-normal text-slate-500">/ {product.saleUnit === 'unit' ? 'un.' : product.saleUnit === 'linear_meter' ? 'm' : product.saleUnit === 'kilometer' ? 'km' : 'm²'}</span></div>
              {isAdmin && product.costPrice !== undefined && <div className="text-xs text-slate-500">Custo {fmt(product.costPrice)} · margem {product.price > 0 ? (((product.price - product.costPrice) / product.price) * 100).toFixed(1).replace('.', ',') : '—'}%</div>}
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <button type="button" onClick={() => onEdit(product)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs hover:bg-slate-50">
                  <Edit2 size={14} /> Editar
                </button>
                <button type="button" onClick={() => onToggleActive(product)} className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50">
                  {product.active ? 'Desativar' : 'Reativar'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
