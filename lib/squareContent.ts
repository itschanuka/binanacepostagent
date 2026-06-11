import type { Post } from "@/lib/database.types";

const styleLabels: Record<Post["content_style"], string> = {
  market_update: "Market update",
  news: "News",
  analysis: "Analysis",
  education: "Education",
  question: "Question",
};

function chartUrl(symbol: string) {
  const normalized = symbol.toUpperCase().replace(/USDT$/, "_USDT");
  return `https://www.binance.com/en/trade/${normalized}?type=spot`;
}

export function buildSquarePostText(post: Post) {
  const lines = [post.content.trim()];

  if (post.coin_symbol) {
    lines.push(`$${post.coin_symbol.replace(/^\$/, "").toUpperCase()}`);
  }

  if (post.chart_symbol) {
    const interval = post.chart_interval ? ` (${post.chart_interval})` : "";
    lines.push(`Chart: ${post.chart_symbol.toUpperCase()}${interval}`);
    lines.push(chartUrl(post.chart_symbol));
  }

  lines.push(`#${styleLabels[post.content_style].replace(/\s+/g, "")}`);

  return lines.filter(Boolean).join("\n\n");
}
