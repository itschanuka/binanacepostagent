import { UpcomingPostsManager } from "./upcoming-posts-manager";

export default function UpcomingPage() {
  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Queue</p>
          <h1>Upcoming posts</h1>
        </div>
      </div>
      <UpcomingPostsManager />
    </section>
  );
}
