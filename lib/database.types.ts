export type PostStatus = "pending" | "posted";

export type Post = {
  id: string;
  content: string;
  image_url: string | null;
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
};
