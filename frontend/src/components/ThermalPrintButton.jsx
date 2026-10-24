import React from 'react';
import { Printer } from 'lucide-react';
import { printThermalHtml } from '../pages/thermalPrint.js';

export default function ThermalPrintButton({ html, label = '80 mm', buttonLabel = label, className = '' }) {
  return (
    <button
      type="button"
      onClick={() => printThermalHtml(html)}
      aria-label={`Imprimir em bobina 80 mm${label === '80 mm' ? '' : `: ${label}`}`}
      title="Imprimir em bobina de 80 mm"
      className={`inline-flex items-center gap-1 rounded-lg border text-sm hover:bg-slate-50 ${className}`}
    >
      <Printer size={14} /> {buttonLabel}
    </button>
  );
}
