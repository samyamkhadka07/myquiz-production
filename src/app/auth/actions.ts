"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { roleHome, type AdminRequestStatus } from "@/lib/auth/role-routing";
import type { Role } from "@/lib/contracts";
export type AuthState = { message: string; success?: boolean };
const credentials = z.object({ email: z.email(), password: z.string().min(12).max(128) });
function loginErrorMessage(error: { code?: string; message?: string; status?: number }) {
  const detail = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (detail.includes("email_not_confirmed") || detail.includes("email not confirmed"))
    return "Please confirm your email before signing in.";
  if (error.status === 429 || detail.includes("rate limit") || detail.includes("too many"))
    return "Too many sign-in attempts. Please wait and try again.";
  if (detail.includes("invalid login") || detail.includes("invalid credentials"))
    return "Incorrect email or password.";
  return "Sign-in is temporarily unavailable. Please try again.";
}
export async function authenticate(_state: AuthState, form: FormData): Promise<AuthState> {
  const mode = String(form.get("mode"));
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  try {
    const db = await createClient();
    if (mode === "recover") {
      z.email().parse(email);
      const r = await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${getEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
      });
      if (r.error) return { message: "Recovery could not be requested. Please try again." };
      return {
        message: "If this email is registered, you will receive a password recovery link.",
        success: true,
      };
    }
    if (mode === "reset") {
      z.string().min(12).max(128).parse(password);
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) return { message: "Open a valid recovery link first." };
      const r = await db.auth.updateUser({ password });
      if (r.error)
        return { message: "Password could not be updated. Request a fresh recovery link." };
      await db.auth.signOut();
      return { message: "Password updated. You can now sign in.", success: true };
    }
    if (mode === "register") {
      credentials.parse({ email, password });
      const name = z.string().trim().min(1).max(80).parse(form.get("display_name"));
      const requestedAccountType = z.enum(["STUDENT", "ADMIN"]).parse(form.get("account_type"));
      const r = await db.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name, requested_account_type: requestedAccountType },
          emailRedirectTo: `${getEnv().NEXT_PUBLIC_APP_URL}/auth/callback`,
        },
      });
      if (r.error)
        return {
          message:
            "Registration could not be completed. Check your details or try password recovery.",
        };
      if (!r.data.session)
        return {
          message: "Check your email to confirm your account, then sign in.",
          success: true,
        };
    } else if (mode === "login") {
      z.email().parse(email);
      if (!password) return { message: "Enter your password." };
      const r = await db.auth.signInWithPassword({ email, password });
      if (r.error) return { message: loginErrorMessage(r.error) };
    } else return { message: "Invalid authentication request." };
  } catch (error) {
    return {
      message:
        error instanceof z.ZodError
          ? "Check your details. New passwords must contain at least 12 characters."
          : "Sign-in is temporarily unavailable. Please try again.",
    };
  }
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
  redirect("/dashboard");
}
export async function logout() {
  const db = await createClient();
  await db.auth.signOut();
  redirect("/login");
}
