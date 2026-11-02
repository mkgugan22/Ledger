import "./dashboard-refresh.css";
import "./DashboardSkeleton.css";

// Placeholder shown while the first batch of data loads. It reuses the real
// dashboard's grid classes so the page doesn't jump when the content arrives.
export default function DashboardSkeleton() {
  return (
    <div className="lg-dashboard" role="status" aria-busy="true">
      <span className="visually-hidden">Loading your entries…</span>
      <div className="lg-dashboard-head" aria-hidden="true">
        <div className="w-100">
          <div className="lg-skel" style={{ width: 150, height: 12 }} />
          <div className="lg-skel mt-2" style={{ width: "min(320px, 70%)", height: 28 }} />
          <div className="lg-skel mt-2" style={{ width: "min(240px, 55%)", height: 12 }} />
        </div>
      </div>
      <div className="lg-dashboard-kpis" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="lg-dashboard-kpi lg-skel-card">
            <div className="lg-skel" style={{ width: "40%", height: 11 }} />
            <div className="lg-skel mt-3" style={{ width: "70%", height: 24 }} />
            <div className="lg-skel mt-2" style={{ width: "55%", height: 10 }} />
          </div>
        ))}
      </div>
      <div className="lg-dashboard-grid" aria-hidden="true">
        <div className="lg-dashboard-panel lg-skel-card"><div className="lg-skel" style={{ width: "100%", height: 260 }} /></div>
        <div className="lg-dashboard-panel lg-skel-card"><div className="lg-skel" style={{ width: "100%", height: 260 }} /></div>
      </div>
    </div>
  );
}
