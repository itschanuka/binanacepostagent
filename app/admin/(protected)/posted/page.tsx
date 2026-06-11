import { PostedHistory } from "./posted-history";

export default function PostedPage() {
  return (
    <section className="admin-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">History</p>
          <h1>Posted posts</h1>
        </div>
      </div>
      <PostedHistory />
    </section>
  );
}
