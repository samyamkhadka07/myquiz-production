export default function Loading() {
  return (
    <section role="status" aria-live="polite" aria-label="Loading your study space">
      <span className="sr-only">Loading your personalized study data…</span>
      <div className="skeleton skeleton-hero" />
      <div className="skeleton-grid">
        {Array.from({ length: 4 }, (_, index) => <div className="skeleton skeleton-card" key={index} />)}
      </div>
      <div className="skeleton skeleton-panel" />
    </section>
  );
}
