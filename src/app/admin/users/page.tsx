import { requirePage, superAdmin } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { StudentDataLifecycle, UserAccess, UserLifecycle } from "@/components/admin-workflow-actions";

type UserRow = { id: string; display_name: string; role: string; account_status: "ACTIVE" | "DEACTIVATED"; created_at: string };

export default async function Page() {
  const { db, profile } = await requirePage(true);
  superAdmin(profile);
  const rows = check(await db.from("profiles").select("id,display_name,role,account_status,created_at").order("created_at", { ascending: false }).limit(100)) as UserRow[];
  return <><h1>Users and roles</h1>
    <p>Only a Super Admin can change privileged access, account lifecycle, or student learning data. Reset creates a recovery snapshot before clearing student state.</p>
    <div className="table-wrap card"><table><thead><tr><th>User</th><th>Role</th><th>Account</th><th>Student data</th><th>Created</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}>
        <td>{r.display_name}</td>
        <td>{r.role === "SUPER_ADMIN" ? <strong>SUPER_ADMIN - protected</strong> : <UserAccess id={r.id} role={r.role} />}</td>
        <td>{r.role === "SUPER_ADMIN" ? <strong>ACTIVE - protected</strong> : <UserLifecycle id={r.id} displayName={r.display_name} status={r.account_status} />}</td>
        <td>{r.role === "STUDENT" ? <StudentDataLifecycle id={r.id} displayName={r.display_name} /> : <span>Not applicable</span>}</td>
        <td>{new Date(r.created_at).toLocaleDateString()}</td>
      </tr>)}</tbody></table></div>
  </>;
}
