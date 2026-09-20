import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { featureLabel, type SubscriptionPlan } from "@/lib/billing";
import type { Route } from "next";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const db = await createClient();
  const result = await db
    .from("subscription_plans")
    .select("*")
    .eq("enabled", true)
    .is("archived_at", null)
    .order("display_order");
  const plans = (result.data ?? []) as SubscriptionPlan[];
  return (
    <main className="landing plans-page">
      <header>
        <Link href="/" className="brand">
          MY<span>QUIZ</span>
        </Link>
        <Link href="/login" className="button secondary">
          Sign in
        </Link>
      </header>
      <section className="section">
        <p className="eyebrow">Choose access that fits your preparation</p>
        <h1>MyQuiz plans</h1>
        <p>Every price, feature and tutor limit below comes from the current plan configuration.</p>
        {result.error ? (
          <div className="error" role="alert">
            Plans could not be loaded. Please try again shortly.
          </div>
        ) : null}
        <div className="card-grid plan-grid">
          {plans.map((plan) => (
            <article
              className={`card section ${plan.recommended ? "premium-card" : ""}`}
              key={plan.id}
            >
              {plan.recommended ? <span className="pill">Recommended</span> : null}
              <h2>{plan.name}</h2>
              <p>{plan.description}</p>
              <div className="metric">NPR {Number(plan.price_npr).toLocaleString()}</div>
              <small>{plan.duration_days ? `${plan.duration_days} days` : "No expiry"}</small>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{featureLabel(feature)}</li>
                ))}
                <li>{plan.ai_daily_limit} AI tutor requests per day</li>
              </ul>
              <p className="muted">{plan.marketing_text}</p>
              <Link href={`/subscription?plan=${plan.id}` as Route} className="button">
                {Number(plan.price_npr) === 0 ? "Start free" : "Choose plan"}
              </Link>
            </article>
          ))}
        </div>
        {!result.error && plans.length === 0 ? (
          <section className="card empty-state">
            <h2>No plans are available right now</h2>
            <p>Your existing access remains unchanged. Please check again later.</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
