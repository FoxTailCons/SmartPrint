export default function BrandMark({ dark = false }) {
  return (
    <div className={`brand-lockup ${dark ? 'brand-lockup-dark' : ''}`}>
      <div className="brand-mark" aria-hidden="true">
        <span className="brand-mark-cyan" />
        <span className="brand-mark-magenta" />
        <span className="brand-mark-yellow" />
        <span className="brand-mark-black" />
        <span className="brand-mark-center" />
      </div>
      <div className="brand-wordmark">
        <strong>smart print.</strong>
        <span>acessórios de papelaria e gráfica rápida</span>
      </div>
    </div>
  );
}
