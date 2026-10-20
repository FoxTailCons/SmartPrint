import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getPaginationState } from '../hooks/usePagination.js';

const pageSizeOptions = [10, 20, 50, 100];

export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const state = getPaginationState(page, pageSize, total);
  if (!state.total) return null;

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm" aria-label="Paginação da lista">
      <p className="text-slate-500" aria-live="polite">
        Exibindo {state.firstItem}–{state.lastItem} de {state.total}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 whitespace-nowrap text-slate-600">
            Itens por página
            <select
              aria-label="Itens por página"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="rounded-lg border bg-white px-2 py-1.5"
            >
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(state.page - 1)}
            disabled={!state.canGoPrevious}
            aria-label="Página anterior"
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <span className="whitespace-nowrap text-slate-600" aria-current="page">
            Página {state.page} de {state.pageCount}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(state.page + 1)}
            disabled={!state.canGoNext}
            aria-label="Próxima página"
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Próxima <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
