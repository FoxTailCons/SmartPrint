import { useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { filterQuickOrderProducts } from '../pages/quickOrderProducts.js';

const getProductLabel = (product) => `${product.code ? `${product.code} · ` : ''}${product.name}`;

export default function ProductCombobox({ products, value, onChange, query, onQueryChange, disabled = false, loading = false, inputRef }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef(null);
  const selectedProduct = products.find((product) => product._id === value);
  const selectedLabel = selectedProduct ? getProductLabel(selectedProduct) : '';
  const inputValue = selectedLabel || query;
  const results = filterQuickOrderProducts(products, query);

  const selectProduct = (product) => {
    onChange(product._id);
    onQueryChange('');
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
      } else {
        setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(Math.max(results.length - 1, 0));
      } else {
        setActiveIndex((index) => Math.max(index - 1, 0));
      }
    } else if (event.key === 'Enter' && open && results[activeIndex]) {
      event.preventDefault();
      selectProduct(results[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      onQueryChange('');
    }
  };

  const noProducts = !loading && products.length === 0;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Buscar produto"
          id="quick-product"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="quick-order-products"
          aria-activedescendant={open && results[activeIndex] ? `quick-order-product-${activeIndex}` : undefined}
          autoComplete="off"
          disabled={disabled || loading || noProducts}
          value={inputValue}
          placeholder={loading ? 'Carregando produtos...' : noProducts ? 'Nenhum produto disponível' : 'Buscar por nome ou código...'}
          onFocus={(event) => { event.currentTarget.select(); setOpen(true); setActiveIndex(0); }}
          onBlur={(event) => {
            if (!wrapperRef.current?.contains(event.relatedTarget)) {
              setOpen(false);
              onQueryChange('');
            }
          }}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
            setActiveIndex(0);
            if (value) onChange('');
          }}
          onKeyDown={handleKeyDown}
          className="mt-1 w-full rounded-lg border bg-white px-3 py-2 pr-10 outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-100"
        />
        <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-slate-400" />
      </div>
      {noProducts && <p className="mt-1 text-sm text-slate-500">Nenhum produto ativo por unidade disponível.</p>}
      <div id="quick-order-products" role="listbox" aria-label="Produtos disponíveis" hidden={!open || disabled || loading || noProducts} className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-white py-1 shadow-lg">
        {results.map((product, index) => (
          <button
            key={product._id}
            id={`quick-order-product-${index}`}
            type="button"
            role="option"
            aria-selected={product._id === value}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectProduct(product)}
            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${index === activeIndex ? 'bg-slate-50' : ''}`}
          >
            <span>{getProductLabel(product)}</span>
            {product._id === value && <Check size={15} aria-hidden="true" className="text-brand-600" />}
          </button>
        ))}
        {!results.length && <p className="px-3 py-2 text-sm text-slate-500">Nenhum produto corresponde à busca.</p>}
      </div>
    </div>
  );
}
