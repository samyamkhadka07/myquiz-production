import Link from "next/link";
import { logout } from "@/app/auth/actions";
import type { Profile, Role } from "@/lib/contracts";
import { SideNavigation, type SideNavigationItem } from "@/components/side-navigation";

type AdminLink = { label: string; href: string; roles: Role[] };
const allStaff: Role[] = ["MODERATOR", "ADMIN", "SUPER_ADMIN"];
const admins: Role[] = ["ADMIN", "SUPER_ADMIN"];
const superAdmins: Role[] = ["SUPER_ADMIN"];
const navigation: AdminLink[] = [
  { label: "— Overview —", href: "/admin", roles: allStaff },
  { label: "Admin Dashboard", href: "/admin", roles: allStaff },
  { label: "— Academic content —", href: "/admin/questions", roles: allStaff },
  { label: "Question Management", href: "/admin/questions", roles: allStaff },
  { label: "Verification Queue", href: "/admin/questions/verification", roles: allStaff },
  { label: "Publication Queue", href: "/admin/questions/publication", roles: allStaff },
  { label: "MEC Taxonomy", href: "/admin/taxonomy", roles: admins },
  { label: "Exam Blueprints", href: "/admin/blueprints", roles: admins },
  { label: "Mnemonics", href: "/admin/mnemonics", roles: admins },
  { label: "Media Library", href: "/admin/media", roles: allStaff },
  { label: "Reading Materials", href: "/admin/reading-materials", roles: allStaff },
  { label: "— Ingestion —", href: "/admin/contributions", roles: allStaff },
  { label: "Contributions", href: "/admin/contributions", roles: allStaff },
  { label: "Staged Questions", href: "/admin/staged", roles: allStaff },
  { label: "CSV Import / Export", href: "/admin/csv", roles: admins },
  { label: "Duplicate Review", href: "/admin/duplicates", roles: allStaff },
  { label: "External Sources", href: "/admin/sources", roles: admins },
  { label: "Ingestion Runs", href: "/admin/ingestion", roles: admins },
  { label: "— Users & community —", href: "/admin/users", roles: superAdmins },
  { label: "Users & Roles", href: "/admin/users", roles: superAdmins },
  { label: "Admin Requests / Approvals", href: "/admin/admin-requests", roles: superAdmins },
  { label: "Comments / Moderation", href: "/admin/moderation", roles: allStaff },
  { label: "Reports", href: "/admin/reports", roles: allStaff },
  { label: "— Billing —", href: "/admin/billing/plans", roles: admins },
  { label: "Subscription Plans", href: "/admin/billing/plans", roles: admins },
  { label: "Payment Methods", href: "/admin/billing/payment-methods", roles: admins },
  { label: "Payment Requests", href: "/admin/billing/payment-requests", roles: admins },
  { label: "— AI & analytics —", href: "/admin/ai-usage", roles: admins },
  { label: "AI Review / Usage", href: "/admin/ai-usage", roles: admins },
  { label: "Admin Analytics", href: "/admin/analytics", roles: admins },
  { label: "— System —", href: "/admin/audit", roles: superAdmins },
  { label: "Audit / Activity", href: "/admin/audit", roles: superAdmins },
  { label: "Activity Archives", href: "/admin/activity-archives", roles: admins },
  { label: "Admin Profile", href: "/admin/profile", roles: allStaff },
];

export function AdminShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const links = navigation.filter((item) => item.roles.includes(profile.role));
  const items: SideNavigationItem[] = links.map((item) =>
    item.label.startsWith("—")
      ? { kind: "group", label: item.label.replaceAll("—", "").trim() }
      : { kind: "link", label: item.label, href: item.href },
  );
  return (
    <div className="shell admin-shell">
      <aside className="side admin-side">
        <Link href="/admin" className="brand">
          MY<span>QUIZ</span>
        </Link>
        <p className="admin-title">ADMINISTRATION</p>
        <p className="side-caption">MEC CEE management</p>
        <SideNavigation items={items} label="Administration navigation" />
        <div className="admin-side-actions">
          <form action={logout}>
            <button className="button side-signout">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="main" id="main-content">
        <div className="account-line">
          <span>{profile.display_name}</span>
          <strong>{profile.role.replace("_", " ")}</strong>
        </div>
        {children}
      </main>
    </div>
  );
}
