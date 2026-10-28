import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { buildMeasuredItem } from '../pages/measurements.js';
import { fmt } from '../api';
import Modal from './Modal.jsx';

const parseNumber = (value) => Number(String(value).replace(',', '.'));
const formatNumber = (value) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

export default function MeasureCalculator({ open, onClose, onAddItem, products = [] }) {
  const [unit, setUnit] = useState('m');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [pieces, setPieces] = useState('1');
  const [multiplyByPieces, setMultiplyByPieces] = useState(true);
  
  
  const [pricePerSquareMeter, setPricePerSquareMeter] = useState('');
  const [description, setDescription] = useState('');
  const [saleMode, setSaleMode] = useState('area');
  const [materialId, setMaterialId] = useState('');
  const [installationFee, setInstallationFee] = useState('');
  const [travelFee, setTravelFee] = useState('');
  const [calculated, setCalculated] = useState(null);
  const [error, setError] = useState('');
  const product = products.find((entry) => entry._id === materialId);
  const change = (setter) => (event) => {
    setter(event.target.type === 'checkbox' ? event.target.checked : event.target.value);
    setCalculated(null);
    setError('');
  };
  const calculate = (event) => {
    event.preventDefault();
    try {
      const item = buildMeasuredItem({
        width: parseNumber(width), height: parseNumber(height), pieces: parseNumber(pieces), unit,
         saleMode, multiplyByPieces,
        pricePerSquareMeter: parseNumber(pricePerSquareMeter), product, description,
        installationFee: parseNumber(installationFee), travelFee: parseNumber(travelFee),
      });
      setCalculated(item);
      setError('');
    } catch (err) {
      setCalculated(null);
      setError(err.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Calcular item por dimensão" wide>
      <form onSubmit={calculate} className="space-y-5">
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">1. Dimensões de cada peça</legend>
          <label className="block text-sm">Unidade de medida
            <select value={unit} onChange={change(setUnit)} className="ml-2 rounded-lg border bg-white px-3 py-2">
              <option value="m">Metros</option><option value="cm">Centímetros</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-sm">Largura ({unit})<input inputMode="decimal" required value={width} onChange={change(setWidth)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
            <label className="text-sm">Altura ({unit})<input inputMode="decimal" required value={height} onChange={change(setHeight)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
            <label className="text-sm">Quantidade de peças<input type="number" min="1" step="1" required value={pieces} onChange={change(setPieces)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={moldEnabled} onChange={change(setMoldEnabled)} />Aplicar fator de molde</label>
            { <label className="text-sm">Fator<input inputMode="decimal" value={} onChange={change(setMoldFactor)} className="ml-2 w-24 rounded-lg border px-3 py-2" /></label>}
          </div>
        </fieldset>
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">2. Material e serviço</legend>
          <label className="block text-sm">Material do catálogo
            <select value={materialId} onChange={change(setMaterialId)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
              <option value="">Item livre / preço manual</option>
              {products.filter((entry) => entry.saleUnit === 'square_meter' && entry.active !== false).map((entry) => <option key={entry._id} value={entry._id}>{entry.name} · {fmt(entry.price)}/m²</option>)}
            </select>
          </label>
          <label className="block text-sm">Serviço / descrição
            <input value={description} onChange={change(setDescription)} placeholder="Ex.: Banner, adesivo, fachada" className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          {!product && <>
            <label className="block text-sm">Preço por m² (R$)<input inputMode="decimal" required value={pricePerSquareMeter} onChange={change(setPricePerSquareMeter)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm">Venda
                <select value={saleMode} onChange={change(setSaleMode)} className="ml-2 rounded-lg border bg-white px-3 py-2"><option value="area">Por m²</option><option value="unit">Por unidade</option></select>
              </label>
              {saleMode === 'area' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={multiplyByPieces} onChange={change(setMultiplyByPieces)} />Multiplicar a área pela quantidade de peças</label>}
            </div>
          </>}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Instalação (R$, opcional)<input type="number" min="0" step="0.01" value={installationFee} onChange={change(setInstallationFee)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          <label className="text-sm">Deslocamento (R$, opcional)<input type="number" min="0" step="0.01" value={travelFee} onChange={change(setTravelFee)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {calculated && <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm" aria-live="polite">
          <p className="font-medium">{calculated.description}</p>
          <p>Área por peça: <strong>{formatNumber(calculated.areaPerPiece)} m²</strong> · Área total: <strong>{formatNumber(calculated.area)} m²</strong></p>
          <p>Preço: <strong>{fmt(calculated.unitPrice)}</strong> · Total com acréscimos: <strong>{fmt(calculated.total)}</strong></p>
        </div>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white"><Calculator size={16} />Calcular</button>
          <button type="button" disabled={!calculated} onClick={() => { if (calculated) { onAddItem(calculated); onClose(); } }} className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50">Adicionar item ao pedido</button>
        </div>
      </form>
    </Modal>
  );
}



