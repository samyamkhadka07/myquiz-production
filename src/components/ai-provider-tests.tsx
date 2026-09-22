"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";

type Provider = "openrouter" | "gemini" | "groq" | "ollama" | "openai";
type Result = { provider: Provider; status: string; message: string; model?: string };
export function AiProviderTests({ providers }: { providers: Array<{ provider: Provider; status: string; canTest: boolean }> }) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [results, setResults] = useState<Partial<Record<Provider, Result>>>({});
  async function test(provider: Provider) {
    setBusy(provider);
    try { const result = await api<Result>("ai-provider-test", "POST", { provider }); setResults(value => ({ ...value, [provider]: result })); }
    catch { setResults(value => ({ ...value, [provider]: { provider, status: "TEMPORARILY_UNAVAILABLE", message: "Provider test could not be completed." } })); }
    finally { setBusy(null); }
  }
  return <section className="card section"><h2>Provider status</h2><div className="record-grid">{providers.map(({provider,status,canTest})=><div key={provider}><span>{provider}</span><strong>{results[provider]?.status ?? status}</strong>{results[provider] ? <small>{results[provider]!.message}{results[provider]!.model ? ` · ${results[provider]!.model}` : ""}</small> : null}<button className="button secondary" type="button" disabled={!canTest || busy!==null} onClick={() => void test(provider)}>{busy===provider?"Testing…":"Test provider"}</button></div>)}</div><p className="muted">Tests send one minimal request to the selected provider only. Credentials remain server-only.</p></section>;
}
