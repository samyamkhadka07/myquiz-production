import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/contracts";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function identity() {
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new ApiError(401, "AUTH_REQUIRED", "Please sign in.");
  const result = await db
    .from("profiles")
    .select(
      "id,display_name,role,target_score,timezone,exam_program_id,onboarding_completed_at,self_assessed_weak_subject_ids",
    )
    .eq("id", user.id)
    .single();
  if (result.error || !result.data)
    throw new ApiError(
      503,
      "PROFILE_UNAVAILABLE",
      "Your profile is unavailable. Please try again.",
    );
  return { db, user, profile: result.data as Profile };
}
export async function requirePage(staff = false) {
  try {
    const ctx = await identity();
    if (staff && !["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(ctx.profile.role)) {
      const request = await ctx.db
        .from("admin_role_requests")
        .select("status")
        .eq("user_id", ctx.profile.id)
        .maybeSingle();
      const status =
        request.data?.status === "REJECTED"
          ? "rejected"
          : request.data?.status === "PENDING"
            ? "pending"
            : "required";
      redirect(`/dashboard?admin_request=${status}`);
    }
    return ctx;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    throw error;
  }
}
export function staff(profile: Profile) {
  if (!["ADMIN", "MODERATOR", "SUPER_ADMIN"].includes(profile.role))
    throw new ApiError(403, "FORBIDDEN", "Staff access required.");
}
export function admin(profile: Profile) {
  if (!["ADMIN", "SUPER_ADMIN"].includes(profile.role))
    throw new ApiError(403, "FORBIDDEN", "Admin access required.");
}
export function superAdmin(profile: Profile) {
  if (profile.role !== "SUPER_ADMIN")
    throw new ApiError(403, "FORBIDDEN", "Super Admin approval is required.");
}
