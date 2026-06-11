import { DashboardMetrics } from "./dashboard-metrics";

export default function DashboardPage() {
  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Overview</h1>
        </div>
      </div>
      <DashboardMetrics />
    </section>
  );
}
