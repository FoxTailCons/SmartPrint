import { useState } from 'react';

export default function BrandMark({ dark = false, compact = false }) {
  // Comece tentando estes. Se nenhum funcionar, digite no campo que aparece na tela.
  const [src, setSrc] = useState('/logo.jpeg');
  const [broken, setBroken] = useState(false);

  return (
    <div className={`brand-lockup${dark ? ' brand-lockup--dark' : ''}${compact ? ' brand-lockup--compact' : ''}`}>
      <div className="brand-mark" aria-hidden="true">
        {!broken ? (
          <img
            src={src}
            alt="SmartPrint logo"
            className="h-6 w-auto"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="text-xs text-red-500">✗ quebrou</span>
        )}
      </div>
      <div className="brand-wordmark">
        <strong>SmartPrint</strong>
        <span>Acessórios de papelaria<br />e gráfica rápida</span>
      </div>

      {/* CAMPO DE TESTE — desaparece quando achar o caminho certo */}
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className="text-slate-500">Testar caminho:</span>
        <input
          value={src}
          onChange={(e) => { setSrc(e.target.value); setBroken(false); }}
          className="w-56 rounded border px-2 py-1"
          placeholder="/logo.jpeg"
        />
        <span className="text-slate-400">URL tentada: <code>{src}</code></span>
      </div>
    </div>
  );
}