export default function Loading() {
  return (
    <section role="status" aria-live="polite" aria-label="Loading administration data">
      <span className="sr-only">Loading authorized operational data…</span>
      <div className="skeleton skeleton-heading" />
      <div className="skeleton-grid">
        {Array.from({ length: 4 }, (_, index) => <div className="skeleton skeleton-card" key={index} />)}
      </div>
      <div className="skeleton skeleton-panel" />
    </section>
  );
}
