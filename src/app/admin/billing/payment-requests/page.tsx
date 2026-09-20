import { admin, requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { PaymentReviewActions } from "@/components/admin-billing";
export default async function Page() {
  const { db, profile } = await requirePage(true);
  admin(profile);
  const rows = check(
    await db
      .from("payment_requests")
      .select(
        "*,profiles!payment_requests_user_id_fkey(display_name),subscription_plans(name),payment_methods(name)",
      )
      .order("submitted_at", { ascending: false })
      .limit(100),
  ) as Array<{
    id: string;
    status: string;
    amount_npr: number;
    reference_id: string;
    note: string | null;
    submitted_at: string;
    profiles: { display_name: string } | null;
    subscription_plans: { name: string } | null;
    payment_methods: { name: string } | null;
  }>;
  return (
    <>
      <p className="eyebrow">Manual verification queue</p>
      <h1>Payment requests</h1>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Plan</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Amount</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.profiles?.display_name ?? "Student"}</td>
                  <td>{row.subscription_plans?.name ?? "Plan"}</td>
                  <td>{row.payment_methods?.name ?? "Method"}</td>
                  <td>{row.reference_id}</td>
                  <td>NPR {Number(row.amount_npr).toLocaleString()}</td>
                  <td>{new Date(row.submitted_at).toLocaleString()}</td>
                  <td>
                    <PaymentReviewActions id={row.id} status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="card empty-state">
          <h2>No payment requests</h2>
          <p>Student submissions will appear here for manual verification.</p>
        </section>
      )}
    </>
  );
}
