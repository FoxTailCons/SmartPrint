import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { calculateAreaPerPiece } from '../pages/measurements.js';
import Modal from './Modal.jsx';

const parseNumber = (value) => Number(String(value).replace(',', '.'));
const formatNumber = (value) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const formatMoney = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function MeasureCalculator({ open, onClose, onAddItem }) {
  const [unit, setUnit] = useState('cm');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [pieces, setPieces] = useState('1');
  const [multiplyByPieces, setMultiplyByPieces] = useState(true);
  const [moldEnabled, setMoldEnabled] = useState(false);
  const [moldFactor, setMoldFactor] = useState('1.5');
  const [pricePerSquareMeter, setPricePerSquareMeter] = useState('');
  const [description, setDescription] = useState('');
  const [saleMode, setSaleMode] = useState('area');
  const [calculated, setCalculated] = useState(null);
  const [error, setError] = useState('');

  const calculate = (event) => {
    event.preventDefault();
    const widthValue = parseNumber(width);
    const heightValue = parseNumber(height);
    const pieceCount = parseNumber(pieces);
    const moldFactorValue = parseNumber(moldFactor);
    const priceValue = parseNumber(pricePerSquareMeter);

    if (![widthValue, heightValue, pieceCount, priceValue].every(Number.isFinite)
      || widthValue <= 0 || heightValue <= 0 || !Number.isInteger(pieceCount) || pieceCount <= 0 || priceValue < 0) {
      setCalculated(null);
      setError('Informe largura, altura e quantidade válidas, além do preço por m².');
      return;
    }
    if (moldEnabled && (!Number.isFinite(moldFactorValue) || moldFactorValue <= 0)) {
      setCalculated(null);
      setError('Informe um fator de molde maior que zero.');
      return;
    }

    const areaPerPiece = calculateAreaPerPiece({
      width: widthValue,
      height: heightValue,
      unit,
      moldEnabled,
      moldFactor: moldFactorValue,
    });
    const area = areaPerPiece * (saleMode === 'area' && !multiplyByPieces ? 1 : pieceCount);
    const quantity = saleMode === 'area' ? area : pieceCount;
    const unitPrice = saleMode === 'area' ? priceValue : areaPerPiece * priceValue;
    const total = quantity * unitPrice;

    if (![areaPerPiece, area, quantity, unitPrice, total].every(Number.isFinite)) {
      setCalculated(null);
      setError('Os valores informados excedem o limite que pode ser calculado.');
      return;
    }

    setCalculated({
      areaPerPiece,
      area,
      quantity,
      unitPrice,
      total,
      pieceCount,
      widthValue,
      heightValue,
    });
    setError('');
  };

  const addItem = () => {
    if (!calculated) return;

    const dimension = `${formatNumber(calculated.widthValue)} ${unit} x ${formatNumber(calculated.heightValue)} ${unit}`;
    const itemDescription = description.trim() || (saleMode === 'area' ? 'Produto por m²' : 'Produto por unidade');
    onAddItem({
      description: `${itemDescription} - ${dimension} - Qtde: ${formatNumber(calculated.pieceCount)}`,
      quantity: calculated.quantity,
      unitPrice: calculated.unitPrice,
      total: calculated.total,
    });
    onClose();
  };

  const clearCalculation = (setter) => (event) => {
    setter(event.target.value);
    setCalculated(null);
    setError('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Calcular item por dimensão" wide>
      <form onSubmit={calculate} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">
            Descrição do item
            <input
              value={description}
              onChange={clearCalculation(setDescription)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="Ex.: Adesivo, etiqueta, banner"
            />
          </label>
          <label className="text-sm font-medium">
            Preço por m² (R$)
            <input
              inputMode="decimal"
              value={pricePerSquareMeter}
              onChange={clearCalculation(setPricePerSquareMeter)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="0,00"
            />
          </label>
        </div>

        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">Dimensões de cada peça</legend>
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="measure-unit" checked={unit === 'cm'} onChange={() => { setUnit('cm'); setCalculated(null); }} />
              Calcular em centímetros
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="measure-unit" checked={unit === 'm'} onChange={() => { setUnit('m'); setCalculated(null); }} />
              Calcular em metros
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <label className="text-sm font-medium">
              Largura ({unit})
              <input
                inputMode="decimal"
                value={width}
                onChange={clearCalculation(setWidth)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                placeholder="0"
              />
            </label>
            <span className="pb-2 text-slate-500">×</span>
            <label className="text-sm font-medium">
              Altura ({unit})
              <input
                inputMode="decimal"
                value={height}
                onChange={clearCalculation(setHeight)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                placeholder="0"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Quantidade de peças
              <input
                inputMode="decimal"
                value={pieces}
                onChange={clearCalculation(setPieces)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                min="0"
              />
            </label>
            <div className="space-y-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={moldEnabled}
                  onChange={(event) => { setMoldEnabled(event.target.checked); setCalculated(null); }}
                />
                Aplicar fator de molde
              </label>
              <label className="flex items-center gap-2 text-sm">
                Fator
                <input
                  inputMode="decimal"
                  value={moldFactor}
                  onChange={clearCalculation(setMoldFactor)}
                  disabled={!moldEnabled}
                  className="w-24 rounded-lg border px-3 py-2 disabled:bg-slate-100"
                />
              </label>
            </div>
          </div>
        </fieldset>

        <fieldset className="flex flex-wrap gap-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">Como o produto é vendido?</legend>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="radio" name="sale-mode" checked={saleMode === 'area'} onChange={() => { setSaleMode('area'); setCalculated(null); }} />
            Por m²
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="radio" name="sale-mode" checked={saleMode === 'unit'} onChange={() => { setSaleMode('unit'); setCalculated(null); }} />
            Por unidade
          </label>
          {saleMode === 'area' && (
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={multiplyByPieces}
                onChange={(event) => { setMultiplyByPieces(event.target.checked); setCalculated(null); }}
              />
              Multiplicar a área pela quantidade de peças
            </label>
          )}
        </fieldset>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {calculated && (
          <div className="grid gap-2 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <p>Área por peça: <strong>{formatNumber(calculated.areaPerPiece)} m²</strong></p>
            <p>Área total: <strong>{formatNumber(calculated.area)} m²</strong></p>
            <p>Valor unitário: <strong>{formatMoney(calculated.unitPrice)}</strong></p>
            <p>Total do item: <strong>{formatMoney(calculated.total)}</strong></p>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
            Cancelar
          </button>
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
            <Calculator size={16} /> Calcular
          </button>
          <button
            type="button"
            onClick={addItem}
            disabled={!calculated}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Adicionar item ao pedido
          </button>
        </div>
      </form>
    </Modal>
  );
}
