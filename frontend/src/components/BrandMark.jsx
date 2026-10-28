export default function BrandMark({ dark = false, compact = false }) {
  return (
    <div
      className={`brand-lockup${dark ? ' brand-lockup--dark' : ''}${compact ? ' brand-lockup--compact' : ''}`}
    >
      <div className="brand-mark" aria-hidden="true">
        <span className="cmyk-logo" />
      </div>
      <div className="brand-wordmark">
        <strong>SmartPrint</strong>
        <span>
          Acessórios de papelaria
          <br />e gráfica rápida
        </span>
      </div>
    </div>
  );
}