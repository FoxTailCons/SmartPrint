export default function ListSkeleton({ variant = 'list', rows = 5 }) {
  const placeholders = Array.from({ length: Math.max(1, rows) }, (_, index) => index);

  return (
    <div className="animate-pulse motion-reduce:animate-none" role="status" aria-label="Carregando lista">
      {placeholders.map((row) => (
        <div
          key={row}
          className={variant === 'table'
            ? 'flex items-center gap-4 border-t px-5 py-4 first:border-t-0'
            : 'flex items-center gap-4 border-b px-5 py-4 last:border-b-0'}
        >
          {variant === 'list' && <div className="h-10 w-10 shrink-0 rounded-full bg-slate-200" />}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-slate-200" />
            <div className="h-2.5 w-3/5 rounded bg-slate-100" />
          </div>
          {variant === 'table' && <div className="h-3 w-1/5 rounded bg-slate-100" />}
        </div>
      ))}
      <span className="sr-only">Carregando...</span>
    </div>
  );
}
