"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import type { PaymentMethod, SubscriptionPlan } from "@/lib/billing";
import { createClient } from "@/lib/supabase/client";

const receiptTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const receiptExtensions: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf",
};

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
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const method = methods.find((item) => item.id === methodId);
  const plan = plans.find((item) => item.id === planId);
  const paymentDestinationReady = Boolean(
    method && (method.qr_url || (method.account_identifier && method.instructions)),
  );
  return (
    <form
      className="card form"
      onSubmit={async (event) => {
        event.preventDefault();
        // React clears currentTarget after an awaited handler. Keep the native form while it is valid.
        const form = event.currentTarget;
        setBusy(true);
        setMessage("");
        let uploadedPath: string | null = null;
        try {
          if (!paymentDestinationReady)
            throw new Error("The selected payment destination is temporarily unavailable. Do not pay until its QR or configured details are visible.");
          if (!receipt || !receiptTypes.includes(receipt.type) || receipt.size > 5 * 1024 * 1024)
            throw new Error("Choose a JPG, PNG, WebP or PDF receipt no larger than 5 MB.");
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("Your session expired.");
          const ext = receiptExtensions[receipt.type]!;
          uploadedPath = `${user.id}/${crypto.randomUUID()}.${ext}`;
          const upload = await supabase.storage.from("payment-receipts").upload(uploadedPath, receipt, {
            contentType: receipt.type, upsert: false,
          });
          if (upload.error) throw upload.error;
          await api("payment-requests", "POST", {
            plan_id: planId,
            payment_method_id: methodId,
            reference_id: reference,
            note: note || null,
            receipt_object_path: uploadedPath,
          });
          // The request now owns the receipt. A later UI operation must never clean up its evidence.
          uploadedPath = null;
          setMessage("Payment under review. Your subscription activates only after verification.");
          setReference("");
          setNote("");
          setReceipt(null);
          form.reset();
          router.refresh();
        } catch (error) {
          if (uploadedPath) {
            const supabase = createClient();
            await supabase.storage.from("payment-receipts").remove([uploadedPath]);
          }
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Submit a payment for verification</h2>
      {plan ? <p><strong>{plan.name}</strong> · NPR {Number(plan.price_npr).toLocaleString()} · {plan.duration_days ?? "No"} day{plan.duration_days === 1 ? "" : "s"}</p> : null}
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
          ) : method.qr_object_path ? (
            <p className="muted">
              This configured payment QR is temporarily unavailable. Do not pay or submit a
              receipt until it loads. <button type="button" className="button secondary" onClick={() => router.refresh()}>Retry</button>
            </p>
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
              <button type="button" className="button secondary" onClick={() => void navigator.clipboard.writeText(method.account_identifier!)}>Copy</button>
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
        Payment receipt *
        <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf" required onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} />
      </label>
      <p className="muted">Accepted: JPG, PNG, WebP, PDF (max 5 MB). Upload the payment-success receipt showing the reference, amount and status when available. Never upload your password, PIN or OTP.</p>
      {receipt ? <p className="muted">Selected: {receipt.name} · {receipt.type || "unknown type"} · {(receipt.size / 1024).toFixed(1)} KB</p> : null}
      <label>
        Optional note
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
      </label>
      <button className="button" disabled={busy || !planId || !methodId || !paymentDestinationReady}>
        {busy ? "Submitting…" : "Submit for verification"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
