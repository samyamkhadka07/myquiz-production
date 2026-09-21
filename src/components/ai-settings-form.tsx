"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";

type Settings = {
  enabled: boolean;
  provider: string;
  model: string;
  free_daily_limit: number;
  global_daily_limit: number;
  global_monthly_limit: number;
  timeout_ms: number;
  max_output_tokens: number;
  nepali_enabled: boolean;
  followups_enabled: boolean;
  maintenance_message: string;
};
export function AiSettingsForm({ settings }: { settings: Settings }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="card form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        const form = new FormData(event.currentTarget);
        try {
          await api("ai-settings", "PATCH", {
            enabled: form.get("enabled") === "on",
            provider: String(form.get("provider")),
            model: String(form.get("model")),
            free_daily_limit: Number(form.get("free_limit")),
            global_daily_limit: Number(form.get("daily_limit")),
            global_monthly_limit: Number(form.get("monthly_limit")),
            timeout_ms: Number(form.get("timeout")),
            max_output_tokens: Number(form.get("max_tokens")),
            nepali_enabled: form.get("nepali") === "on",
            followups_enabled: form.get("followups") === "on",
            maintenance_message: String(form.get("message")),
          });
          setMessage("AI controls saved. No secret values were changed or displayed.");
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Tutor controls</h2>
      <p className="muted">
        The global switch is off by default. Provider credentials remain environment-managed.
      </p>
      <label className="check">
        <input name="enabled" type="checkbox" defaultChecked={settings.enabled} /> Enable AI tutor
        globally
      </label>
      <label>
        Provider
        <select name="provider" defaultValue={settings.provider}>
          <option value="disabled">Disabled</option>
          <option value="openrouter">OpenRouter</option>
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama (local/self-hosted)</option>
        </select>
      </label>
      <label>
        Model
        <input name="model" defaultValue={settings.model} maxLength={100} required />
      </label>
      <div className="form-grid">
        <label>
          Free daily limit
          <input
            name="free_limit"
            type="number"
            min="0"
            max="100"
            defaultValue={settings.free_daily_limit}
          />
        </label>
        <label>
          Global daily ceiling
          <input
            name="daily_limit"
            type="number"
            min="0"
            max="100000"
            defaultValue={settings.global_daily_limit}
          />
        </label>
        <label>
          Global monthly ceiling
          <input
            name="monthly_limit"
            type="number"
            min="0"
            max="1000000"
            defaultValue={settings.global_monthly_limit}
          />
        </label>
        <label>
          Timeout (ms)
          <input
            name="timeout"
            type="number"
            min="1000"
            max="30000"
            defaultValue={settings.timeout_ms}
          />
        </label>
        <label>
          Max response tokens
          <input
            name="max_tokens"
            type="number"
            min="100"
            max="2000"
            defaultValue={settings.max_output_tokens}
          />
        </label>
      </div>
      <label className="check">
        <input name="nepali" type="checkbox" defaultChecked={settings.nepali_enabled} /> Nepali
        explanations
      </label>
      <label className="check">
        <input name="followups" type="checkbox" defaultChecked={settings.followups_enabled} />{" "}
        Follow-ups (reserved; remains unavailable until scoped chat ships)
      </label>
      <label>
        Maintenance message
        <textarea
          name="message"
          minLength={10}
          maxLength={500}
          defaultValue={settings.maintenance_message}
          required
        />
      </label>
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : "Save AI controls"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
