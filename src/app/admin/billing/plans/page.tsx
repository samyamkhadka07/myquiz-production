import { admin, requirePage } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { PlanEditor } from "@/components/admin-billing";
import type { SubscriptionPlan } from "@/lib/billing";
export default async function Page() {
  const { db, profile } = await requirePage(true);
  admin(profile);
  const plans = check(
    await db.from("subscription_plans").select("*").order("display_order"),
  ) as SubscriptionPlan[];
  return (
    <>
      <p className="eyebrow">Billing configuration</p>
      <h1>Subscription plans</h1>
      <p>
        Plan edits create a new version. Existing subscriptions keep the feature snapshot purchased
        by the student.
      </p>
      <div className="admin-card-grid">
        {plans.map((plan) => (
          <PlanEditor plan={plan} key={plan.id} />
        ))}
      </div>
    </>
  );
}
