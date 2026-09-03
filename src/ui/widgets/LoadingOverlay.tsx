import { useTerraStore } from '@/state/store';

export function LoadingOverlay() {
  const boot = useTerraStore((s) => s.boot);
  const diagnostics = useTerraStore((s) => s.diagnostics);
  if (boot.phase === 'ready') return null;
  const error = boot.phase === 'error';
  return (
    <div className={`terra-loading ${boot.phase === 'init' || boot.phase === 'viewer' ? 'opaque' : 'translucent'}`} role="status" aria-live="polite">
      <div className="terra-loading-card">
        <h1>Terra Infinite</h1>
        <p className="terra-tagline">A streamed, explorable Earth — from orbit to the leaf.</p>
        {error ? (
          <>
            <p className="terra-error">{boot.error}</p>
            <p className="terra-hint">Terra Infinite needs a browser with WebGL2. Try Chrome, Edge, Firefox or Safari 15+, enable hardware acceleration, or lower the quality preset.</p>
            <pre className="terra-errlog">{diagnostics.filter((d) => d.level === 'error').map((d) => `${d.time} ${d.message}`).join('\n') || 'No further details.'}</pre>
          </>
        ) : (
          <>
            <div className="terra-progress"><div style={{ width: `${Math.round(boot.progress * 100)}%` }} /></div>
            <p className="terra-hint">{boot.message}</p>
          </>
        )}
      </div>
    </div>
  );
}
