"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
export function ActionButtons({
  resource,
  id,
  actions,
  onCompleted,
}: {
  resource: string;
  id: string;
  actions: string[];
  onCompleted?: (action: string) => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [completed, setCompleted] = useState("");
  return (
    <div>
      <div className="toolbar">
        {actions
          .filter((action) => !completed || action === completed)
          .map((action) => (
            <button
              className="button secondary"
              disabled={busy}
              key={action}
              onClick={async () => {
                setBusy(true);
                try {
                  const path =
                    resource === "processing" && ["run", "retry"].includes(action)
                      ? `${resource}/${id}/${action}`
                      : resource === "comments"
                        ? `${resource}/${id}/moderate`
                        : `${resource}/${id}`;
                  await api(path, "POST", { action });
                  setCompleted(action);
                  setMessage(`${action.replaceAll("_", " ").toLowerCase()} saved.`);
                  onCompleted?.(action);
                  router.refresh();
                } catch (e) {
                  setMessage((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {completed === action
                ? `${action.replaceAll("_", " ")} ✓`
                : action.replaceAll("_", " ")}
            </button>
          ))}
      </div>
      <small role="status">{message}</small>
    </div>
  );
}
export function StagedEditor({ id, initial }: { id: string; initial: Record<string, unknown> }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const explanations = (draft.option_explanations ?? {}) as Record<string, string>;
  function field(name: string, value: unknown) {
    setDraft((current) => ({ ...current, [name]: value }));
  }
  function explanation(option: string, value: string) {
    setDraft((current) => ({
      ...current,
      option_explanations: {
        ...((current.option_explanations ?? {}) as Record<string, string>),
        [option]: value,
      },
    }));
  }
  async function act(
    action: "IMPORT" | "IMPORT_VERIFY" | "IMPORT_PUBLISH" | "REJECT" | "NEEDS_REVISION",
  ) {
    setBusy(true);
    try {
      const questionId = await api<string | null>(`staged/${id}`, "POST", {
        action,
        data: action === "REJECT" ? null : draft,
      });
      setMessage(
        questionId ? `Saved as canonical question ${questionId}.` : "Review decision saved.",
      );
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form staged-review-form">
      <label>
        Question
        <textarea
          value={String(draft.question_text ?? "")}
          onChange={(e) => field("question_text", e.target.value)}
        />
      </label>
      {(["A", "B", "C", "D"] as const).map((option) => (
        <div className="staged-option" key={option}>
          <label>
            Option {option}
            <input
              value={String(draft[`option_${option.toLowerCase()}`] ?? "")}
              onChange={(e) => field(`option_${option.toLowerCase()}`, e.target.value)}
            />
          </label>
          <label>
            Why {option} is correct or incorrect
            <textarea
              value={explanations[option] ?? ""}
              onChange={(e) => explanation(option, e.target.value)}
            />
          </label>
        </div>
      ))}
      <div className="grid">
        <label>
          Correct answer
          <select
            value={String(draft.correct_answer ?? "")}
            onChange={(e) => field("correct_answer", e.target.value || null)}
          >
            <option value="">Select after checking source</option>
            {["A", "B", "C", "D"].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Difficulty
          <select
            value={String(draft.difficulty ?? "")}
            onChange={(e) => field("difficulty", e.target.value || null)}
          >
            <option value="">Unassigned</option>
            {["EASY", "MEDIUM", "HARD"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Complete solution
        <textarea
          value={String(draft.explanation ?? "")}
          onChange={(e) => field("explanation", e.target.value)}
        />
      </label>
      <p className="muted">
        Import keeps this candidate editable. Verify requires a checked answer, complete
        explanations, taxonomy and provenance. Publishing makes the same canonical record eligible
        for student tests.
      </p>
      <div className="toolbar">
        <button className="button secondary" disabled={busy} onClick={() => void act("IMPORT")}>
          Save to question bank
        </button>
        <button className="button" disabled={busy} onClick={() => void act("IMPORT_VERIFY")}>
          Save and verify
        </button>
        <button className="button" disabled={busy} onClick={() => void act("IMPORT_PUBLISH")}>
          Verify and publish
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void act("NEEDS_REVISION")}
        >
          Needs revision
        </button>
        <button className="button secondary" disabled={busy} onClick={() => void act("REJECT")}>
          Reject candidate
        </button>
      </div>
      <small role="status">{message}</small>
    </div>
  );
}
export function UserAccess({ id, role }: { id: string; role: string }) {
  const [value, setValue] = useState(role),
    [message, setMessage] = useState("");
  return (
    <div>
      <select aria-label="Role" value={value} onChange={(e) => setValue(e.target.value)}>
        <option>STUDENT</option>
        <option>MODERATOR</option>
        <option>ADMIN</option>
      </select>
      <button
        className="button secondary"
        onClick={async () => {
          try {
            await api(`users/${id}`, "PATCH", { role: value, tier: "FREE", ends_at: null });
            setMessage("Access updated.");
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Save role
      </button>
      <small role="status">{message}</small>
    </div>
  );
}
export function AdminRequestActions({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState(""),
    [message, setMessage] = useState(""),
    [decision, setDecision] = useState<"APPROVE" | "REJECT" | "">("");
  async function decide(nextDecision: "APPROVE" | "REJECT") {
    try {
      await api(`admin-requests/${id}`, "PATCH", {
        decision: nextDecision,
        note: note.trim() || null,
      });
      setDecision(nextDecision);
      setMessage(`${nextDecision === "APPROVE" ? "Admin access approved" : "Request rejected"}.`);
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <div className="form">
      <label>
        Decision note (optional)
        <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="toolbar">
        <button
          className="button"
          disabled={Boolean(decision)}
          onClick={() => void decide("APPROVE")}
        >
          Approve Admin
        </button>
        <button
          className="button secondary"
          disabled={Boolean(decision)}
          onClick={() => void decide("REJECT")}
        >
          Reject
        </button>
      </div>
      <small role="status">{message}</small>
    </div>
  );
}
