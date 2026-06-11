import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">Admin</p>
        <h1>Sign in</h1>
        <p className="auth-copy">
          Use the admin account created in Supabase Auth to manage the posting
          queue.
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
