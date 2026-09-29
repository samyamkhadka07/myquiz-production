import { requirePage } from "@/lib/server/auth";
import { AppShell } from "@/components/app-shell";
import { isStaffRole } from "@/lib/auth/role-routing";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { profile, db } = await requirePage();
  if (isStaffRole(profile.role)) redirect("/admin");

  const { data: entitlement, error } = await db
    .from("entitlements")
    .select("tier,ends_at")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (error) throw error;

  return (
    <AppShell
      profile={profile}
      entitlement={
        (entitlement ?? { tier: "FREE", ends_at: null }) as {
          tier: "FREE" | "PREMIUM";
          ends_at: string | null;
        }
      }
    >
      {children}
    </AppShell>
  );
}
