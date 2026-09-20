import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleHome, type AdminRequestStatus } from "@/lib/auth/role-routing";
import type { Role } from "@/lib/contracts";
import type { Route } from "next";
export const dynamic = "force-dynamic";
export default async function Home() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (user) {
    const [profile, request] = await Promise.all([
      db.from("profiles").select("role,onboarding_completed_at").eq("id", user.id).single(),
      db.from("admin_role_requests").select("status").eq("user_id", user.id).maybeSingle(),
    ]);
    if (profile.data)
      redirect(
        roleHome(
          profile.data.role as Role,
          (request.data?.status ?? null) as AdminRequestStatus,
          Boolean(profile.data.onboarding_completed_at),
        ),
      );
  }
  return (
    <main className="landing">
      <header>
        <Link href="/" className="brand">
          MY<span>QUIZ</span>
        </Link>
        <Link href="/login" className="button secondary">
          Sign in
        </Link>
        <Link href={"/plans" as Route}>Plans</Link>
      </header>
      <section className="landing-content">
        <p className="eyebrow">MEC CEE preparation</p>
        <h1>
          Make every
          <br />
          practice count.
        </h1>
        <p>
          Practice verified questions, review your mistakes and build a study plan from your own
          progress.
        </p>
        <div className="inline-links">
          <Link href="/register" className="button">
            Create your account
          </Link>
          <Link href="/login">Continue studying</Link>
        </div>
        <p className="muted">
          Aligned with the supplied MEC bachelor entrance syllabus, third revision 2026.
        </p>
      </section>
    </main>
  );
}
