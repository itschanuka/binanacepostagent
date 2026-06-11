import { SettingsPanel } from "./settings-panel";

export default function SettingsPage() {
  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Scheduler settings</h1>
        </div>
      </div>
      <SettingsPanel />
    </section>
  );
}
