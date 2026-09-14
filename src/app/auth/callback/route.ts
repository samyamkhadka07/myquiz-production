import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { roleHome, type AdminRequestStatus } from "@/lib/auth/role-routing";
import type { Role } from "@/lib/contracts";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await createClient();
  const code = url.searchParams.get("code");
  const token = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const result = code
    ? await db.auth.exchangeCodeForSession(code)
    : token && (type === "email" || type === "recovery")
      ? await db.auth.verifyOtp({ token_hash: token, type })
      : null;
  let target =
    url.searchParams.get("next") === "/reset-password" ? "/reset-password" : "/dashboard";
  if (result && !result.error && target !== "/reset-password") {
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user) {
      const [profile, requestRow] = await Promise.all([
        db.from("profiles").select("role,onboarding_completed_at").eq("id", user.id).single(),
        db.from("admin_role_requests").select("status").eq("user_id", user.id).maybeSingle(),
      ]);
      if (profile.data)
        target = roleHome(
          profile.data.role as Role,
          (requestRow.data?.status ?? null) as AdminRequestStatus,
          Boolean(profile.data.onboarding_completed_at),
        );
    }
  }
  return NextResponse.redirect(
    new URL(
      result && !result.error ? target : "/login?error=confirmation",
      getEnv().NEXT_PUBLIC_APP_URL,
    ),
  );
}
