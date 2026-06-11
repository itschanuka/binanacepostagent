import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Binance Square Content Scheduler",
  description: "Admin dashboard for scheduling Binance Square content.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
