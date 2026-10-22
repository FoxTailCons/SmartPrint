export default function GraphicItemFields({ item, onChange }) {
  return (
    <details className="col-span-full min-w-0 rounded-lg border bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-medium">Material, acabamento, arte e instalação</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          ['material', 'Material', 'text'], ['finishing', 'Acabamento', 'text'],
          ['applicationLocation', 'Local de aplicação', 'text'], ['promisedDate', 'Prazo combinado', 'date'],
          ['artworkUrl', 'Link da arte (http/https)', 'url'], ['installationNotes', 'Observação de instalação', 'text'],
          ['installationFee', 'Acréscimo de instalação (R$)', 'number'], ['travelFee', 'Deslocamento (R$)', 'number'],
        ].map(([field, label, type]) => (
          <label key={field} className="text-xs text-slate-600">{label}
            <input type={type} value={item[field] ?? ''} onChange={(event) => onChange(field, event.target.value)}
              {...(type === 'number' ? { min: 0, step: '0.01' } : {})}
              {...(type === 'url' ? { pattern: 'https?://.+' } : {})}
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm" />
          </label>
        ))}
      </div>
    </details>
  );
}
