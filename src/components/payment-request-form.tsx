"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import type { PaymentMethod, SubscriptionPlan } from "@/lib/billing";

export function PaymentRequestForm({
  plans,
  methods,
  initialPlan,
}: {
  plans: SubscriptionPlan[];
  methods: PaymentMethod[];
  initialPlan: string;
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState(initialPlan);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const method = methods.find((item) => item.id === methodId);
  return (
    <form
      className="card form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          await api("payment-requests", "POST", {
            plan_id: planId,
            payment_method_id: methodId,
            reference_id: reference,
            note: note || null,
          });
          setMessage("Payment request submitted for verification.");
          setReference("");
          setNote("");
          router.refresh();
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Submit a payment for verification</h2>
      <label>
        Plan
        <select value={planId} onChange={(event) => setPlanId(event.target.value)} required>
          {plans.map((plan) => (
            <option value={plan.id} key={plan.id}>
              {plan.name} · NPR {Number(plan.price_npr).toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      <label>
        Payment method
        <select value={methodId} onChange={(event) => setMethodId(event.target.value)} required>
          {methods.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {method ? (
        <section className="payment-instructions">
          <h3>{method.name}</h3>
          {method.qr_url ? (
            // Signed private-storage URLs intentionally bypass the public image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={method.qr_url} alt={`${method.name} payment QR`} className="payment-qr" />
          ) : (
            <p className="muted">
              QR payment is awaiting owner configuration. Use this method only if the payment
              details below are complete.
            </p>
          )}
          {method.display_name ? (
            <p>
              <strong>Account:</strong> {method.display_name}
            </p>
          ) : null}
          {method.account_identifier ? (
            <p>
              <strong>Identifier:</strong> {method.account_identifier}
            </p>
          ) : null}
          {method.instructions ? <p>{method.instructions}</p> : null}
        </section>
      ) : null}
      <label>
        Transaction/reference ID
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          minLength={3}
          maxLength={120}
          required
        />
      </label>
      <label>
        Optional note
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
      </label>
      <button className="button" disabled={busy || !planId || !methodId}>
        {busy ? "Submitting…" : "Submit for verification"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
