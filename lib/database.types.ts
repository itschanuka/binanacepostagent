export type PostStatus = "pending" | "posted";
export type PostContentStyle =
  | "market_update"
  | "news"
  | "analysis"
  | "education"
  | "question";

export type Post = {
  id: string;
  content: string;
  image_url: string | null;
  content_style: PostContentStyle;
  coin_symbol: string | null;
  chart_symbol: string | null;
  chart_interval: string | null;
  scheduled_for: string | null;
  status: PostStatus;
  batch_id: string;
  position: number;
  square_post_id: string | null;
  square_post_url: string | null;
  posted_at: string | null;
  created_at: string;
};

export type Settings = {
  id: number;
  daily_limit: number;
  active_batch_id: string | null;
  cycle_count: number;
  post_interval_minutes: number;
};
