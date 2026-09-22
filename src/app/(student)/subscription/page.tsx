import Link from "next/link";
import { requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { PaymentRequestForm } from "@/components/payment-request-form";
import { featureLabel, type PaymentMethod, type SubscriptionPlan } from "@/lib/billing";
import type { Route } from "next";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: requestedPlan } = await searchParams;
  const { db, profile } = await requirePage();
  const today = new Date(); today.setUTCHours(0,0,0,0);
  const [plansResult, methodsResult, subscriptionsResult, paymentsResult, aiUsageResult] = await Promise.all([
    db
      .from("subscription_plans")
      .select("*")
      .eq("enabled", true)
      .is("archived_at", null)
      .order("display_order"),
    db.from("payment_methods").select("*").eq("enabled", true).order("display_order"),
    db
      .from("subscriptions")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("payment_requests")
      .select("*,subscription_plans(name),payment_methods(name)")
      .eq("user_id", profile.id)
      .order("submitted_at", { ascending: false })
      .limit(20),
    db.from("ai_usage_logs").select("id",{count:"exact",head:true}).eq("user_id",profile.id).eq("purpose","TUTOR").eq("status","SUCCEEDED").gte("created_at",today.toISOString()),
  ]);
  const plans = check(plansResult) as SubscriptionPlan[];
  const methods = check(methodsResult) as PaymentMethod[];
  const subscriptions = check(subscriptionsResult) as Array<{
    id: string;
    status: string;
    starts_at: string;
    ends_at: string | null;
    plan_snapshot: { name?: string; features?: string[]; ai_daily_limit?: number };
  }>;
  const payments = check(paymentsResult) as Array<{
    id: string;
    status: string;
    amount_npr: number;
    reference_id: string;
    submitted_at: string;
    subscription_plans: { name: string } | null;
    payment_methods: { name: string } | null;
  }>;
  const aiUsed=aiUsageResult.count??0;
  // The private QR bucket deliberately has no Student listing/read policy. The page first
  // reads only enabled destinations through Student RLS, then issues a short-lived URL for
  // just those rows on the server.
  let methodsWithUrls: PaymentMethod[];
  try {
    const paymentAssets = createAdminClient().storage.from("payment-assets");
    methodsWithUrls = await Promise.all(
      methods.map(async (method) => {
        if (!method.qr_object_path) return { ...method, qr_url: null };
        const signed = await paymentAssets.createSignedUrl(method.qr_object_path, 300);
        return { ...method, qr_url: signed.data?.signedUrl ?? null };
      }),
    );
  } catch {
    // A missing server credential must not take the whole subscription page down. The form
    // keeps payment submission disabled until an actual destination can be rendered.
    methodsWithUrls = methods.map((method) => ({ ...method, qr_url: null }));
  }
  const current = subscriptions.find(
    (item) =>
      ["ACTIVE", "TRIAL", "PROMOTIONAL"].includes(item.status) &&
      (!item.ends_at || new Date(item.ends_at) > new Date()),
  );
  const revoked = subscriptions.find((item) => item.status === "REVOKED");
  const paidPlans = plans.filter((plan) => Number(plan.price_npr) > 0);
  const freePlan=plans.find((plan)=>plan.code==="FREE");
  const effectivePlan=current?.plan_snapshot??freePlan;
  const initialPlan = paidPlans.some((plan) => plan.id === requestedPlan)
    ? requestedPlan!
    : (paidPlans[0]?.id ?? "");
  return (
    <>
      <section className="student-page-header">
        <div>
          <p className="eyebrow">Access and billing</p>
          <h1>Your subscription</h1>
          <p>
            See exactly what your current access includes and track every manual payment request.
          </p>
        </div>
        <Link href={"/plans" as Route} className="button secondary">
          View all plans
        </Link>
      </section>
      <section className="card section">
        <h2>{effectivePlan?.name ?? "Free access"}</h2>
        <span className="pill">{current?.status ?? "FREE"}</span>
        {current ? (
          <>
            <p>
              {new Date(current.starts_at).toLocaleDateString()} →{" "}
              {current.ends_at ? new Date(current.ends_at).toLocaleDateString() : "No expiry"}
            </p>
            <p>AI tutor: {aiUsed} used of {current.plan_snapshot.ai_daily_limit ?? 0} today</p>
            <ul>
              {(current.plan_snapshot.features ?? []).map((feature) => (
                <li key={feature}>{featureLabel(feature)}</li>
              ))}
            </ul>
          </>
        ) : (
          <><p>Your effective access is Free.</p><p>AI tutor: {aiUsed} used of {freePlan?.ai_daily_limit ?? 0} today</p><ul>{(freePlan?.features??[]).map(feature=><li key={feature}>{featureLabel(feature)}</li>)}</ul>{revoked?<p className="muted">Previous subscription: <strong>REVOKED</strong>. Paid features are no longer available.</p>:null}</>
        )}
      </section>
      {paidPlans.length && methodsWithUrls.length ? (
        <PaymentRequestForm plans={paidPlans} methods={methodsWithUrls} initialPlan={initialPlan} />
      ) : (
        <section className="card empty-state">
          <h2>Manual payment is not configured yet</h2>
          <p>
            No owner-approved payment method is currently enabled. Your existing access remains
            unchanged.
          </p>
        </section>
      )}
      <section className="card section">
        <h2>Payment history</h2>
        {payments.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.subscription_plans?.name ?? "Plan"}</td>
                    <td>{payment.payment_methods?.name ?? "Method"}</td>
                    <td>{payment.reference_id}</td>
                    <td>NPR {Number(payment.amount_npr).toLocaleString()}</td>
                    <td>
                      <span className="pill">{payment.status.replaceAll("_", " ")}</span>
                    </td>
                    <td>{new Date(payment.submitted_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <p>You have not submitted a payment request yet.</p>
          </div>
        )}
      </section>
    </>
  );
}
