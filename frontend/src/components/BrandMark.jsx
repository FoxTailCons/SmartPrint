import { useState } from 'react';

// Tenta várias localizações comuns do logo. Ajuste a ordem se seu arquivo estiver em outro lugar.
const LOGO_CANDIDATES = [
  '/logo.jpeg',

  '/assets/logo.jpeg',

];

function FallbackMonogram({ dark }) {
  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" role="img" aria-label="SmartPrint">
      <rect width="32" height="32" rx="7" fill={dark ? '#ffffff' : '#2563eb'} />
      <text x="16" y="21" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="14" fill={dark ? '#2563eb' : '#ffffff'}>
        SP
      </text>
    </svg>
  );
}

export default function BrandMark({ dark = false, compact = false, src }) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const candidates = src ? [src, ...LOGO_CANDIDATES] : LOGO_CANDIDATES;
  const currentSrc = candidates[candidateIndex];

  const handleError = () => {
    if (candidateIndex < candidates.length - 1) {
      setCandidateIndex((i) => i + 1);
    } else {
      setFailed(true);
    }
  };

  return (
    <div className={`brand-lockup${dark ? ' brand-lockup--dark' : ''}${compact ? ' brand-lockup--compact' : ''}`}>
      <div className="brand-mark" aria-hidden="true">
        {failed ? (
          <FallbackMonogram dark={dark} />
        ) : (
          <img src={currentSrc} alt="SmartPrint logo" className="h-6 w-auto" onError={handleError} />
        )}
      </div>
      <div className="brand-wordmark">
        <strong>SmartPrint</strong>
        <span>Acessórios de papelaria<br />e gráfica rápida</span>
      </div>
    </div>
  );
}