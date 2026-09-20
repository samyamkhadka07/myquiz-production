"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import type { PaymentMethod, SubscriptionPlan } from "@/lib/billing";

export function PlanEditor({ plan }: { plan: SubscriptionPlan }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="card form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        const form = new FormData(event.currentTarget);
        try {
          await api(`subscription-plans/${plan.id}`, "PATCH", {
            name: String(form.get("name")),
            description: String(form.get("description")),
            price_npr: Number(form.get("price")),
            duration_days: form.get("duration") ? Number(form.get("duration")) : null,
            features: String(form.get("features"))
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
            ai_daily_limit: Number(form.get("ai_limit")),
            marketing_text: String(form.get("marketing")),
            display_order: Number(form.get("order")),
            recommended: form.get("recommended") === "on",
            enabled: form.get("enabled") === "on",
          });
          setMessage("Plan saved. Existing purchased subscriptions retain their snapshot.");
          router.refresh();
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="top">
        <div>
          <span className="pill">
            {plan.code} · version {plan.version}
          </span>
          <h2>{plan.name}</h2>
        </div>
      </div>
      <label>
        Name
        <input name="name" defaultValue={plan.name} required maxLength={80} />
      </label>
      <label>
        Description
        <textarea name="description" defaultValue={plan.description} maxLength={500} />
      </label>
      <div className="form-grid">
        <label>
          Price (NPR)
          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={plan.price_npr}
            required
          />
        </label>
        <label>
          Duration days
          <input
            name="duration"
            type="number"
            min="1"
            max="3660"
            defaultValue={plan.duration_days ?? ""}
          />
        </label>
        <label>
          AI daily limit
          <input
            name="ai_limit"
            type="number"
            min="0"
            max="1000"
            defaultValue={plan.ai_daily_limit}
          />
        </label>
        <label>
          Display order
          <input name="order" type="number" min="0" defaultValue={plan.display_order} />
        </label>
      </div>
      <label>
        Machine-readable features (comma separated)
        <textarea name="features" defaultValue={plan.features.join(", ")} required />
      </label>
      <label>
        Student-facing message
        <textarea name="marketing" defaultValue={plan.marketing_text} maxLength={500} />
      </label>
      <label className="check">
        <input name="enabled" type="checkbox" defaultChecked={plan.enabled} /> Enabled
      </label>
      <label className="check">
        <input name="recommended" type="checkbox" defaultChecked={plan.recommended} /> Recommended
      </label>
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : "Save new version"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

export function PaymentMethodEditor({ method }: { method: PaymentMethod }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="card form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        const form = new FormData(event.currentTarget);
        try {
          await api(`payment-methods/${method.id}`, "PATCH", {
            name: String(form.get("name")),
            enabled: form.get("enabled") === "on",
            qr_object_path: method.qr_object_path,
            display_name: String(form.get("display_name")) || null,
            instructions: String(form.get("instructions")) || null,
            account_identifier: String(form.get("identifier")) || null,
            verification_instructions: String(form.get("verification")) || null,
            display_order: Number(form.get("order")),
          });
          setMessage("Payment method saved.");
          router.refresh();
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="pill">{method.code}</span>
      <h2>{method.name}</h2>
      <label>
        Name
        <input name="name" defaultValue={method.name} required />
      </label>
      <label>
        Account/display name
        <input name="display_name" defaultValue={method.display_name ?? ""} />
      </label>
      <label>
        Account/mobile identifier
        <input name="identifier" defaultValue={method.account_identifier ?? ""} />
      </label>
      <label>
        Student instructions
        <textarea name="instructions" defaultValue={method.instructions ?? ""} />
      </label>
      <label>
        Verification instructions
        <textarea name="verification" defaultValue={method.verification_instructions ?? ""} />
      </label>
      <label>
        Display order
        <input name="order" type="number" min="0" defaultValue={method.display_order} />
      </label>
      <p className="muted">
        QR asset: {method.qr_object_path ? "Configured" : "Awaiting owner-supplied QR"}
      </p>
      <label className="check">
        <input name="enabled" type="checkbox" defaultChecked={method.enabled} /> Enabled for
        students
      </label>
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : "Save method"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

export function PaymentReviewActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!["PENDING", "CLARIFICATION_REQUESTED"].includes(status))
    return <span className="pill">{status.replaceAll("_", " ")}</span>;
  async function act(action: "APPROVE" | "REJECT" | "REQUEST_CLARIFICATION") {
    const note =
      window.prompt(action === "APPROVE" ? "Optional approval note" : "Add a review note") ?? null;
    if (action !== "APPROVE" && !note) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`payment-requests/${id}`, "PATCH", { action, note });
      setMessage(`${action.replaceAll("_", " ")} saved.`);
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="toolbar">
        <button className="button" disabled={busy} onClick={() => void act("APPROVE")}>
          Approve
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void act("REQUEST_CLARIFICATION")}
        >
          Request clarification
        </button>
        <button className="button secondary" disabled={busy} onClick={() => void act("REJECT")}>
          Reject
        </button>
      </div>
      {message ? <small role="status">{message}</small> : null}
    </div>
  );
}
