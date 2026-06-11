import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerAuthClient } from "@/lib/supabase/server";
import { LogoutButton } from "../logout-button";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <p className="eyebrow">Binance Square</p>
          <h2>Scheduler</h2>
        </div>
        <nav aria-label="Admin navigation">
          <Link href="/admin/dashboard">Dashboard</Link>
          <Link href="/admin/upcoming">Upcoming</Link>
          <Link href="/admin/posted">Posted</Link>
          <Link href="/admin/settings">Settings</Link>
        </nav>
        <LogoutButton />
      </aside>
      <main className="admin-content">{children}</main>
    </div>
  );
}
