export default function BrandMark({ dark = false, compact = false }) {
  return (
    <div className={`brand-lockup ${dark ? 'brand-lockup-dark' : ''} ${compact ? 'brand-lockup-compact' : ''}`}>
      <div className="brand-mark" aria-hidden="true">
        <span className="brand-mark-cyan" />
        <span className="brand-mark-magenta" />
        <span className="brand-mark-yellow" />
        <span className="brand-mark-black" />
        <span className="brand-mark-center" />
      </div>
      <div className={`brand-wordmark ${compact ? 'lg:hidden' : ''}`}>
        <strong>SmartPrint</strong>
        <span>AcessÃ³rios de papelaria<br />e grÃ¡fica rÃ¡pida</span>
      </div>
    </div>
  );
}


