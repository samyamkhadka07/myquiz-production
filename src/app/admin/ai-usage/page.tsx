import { requirePage, admin } from "@/lib/server/auth";
import { check } from "@/lib/server/data";
import { AiSettingsForm } from "@/components/ai-settings-form";
import { AiProviderTests } from "@/components/ai-provider-tests";
function providerStatus(name:string){if(name==='openrouter')return process.env.OPENROUTER_API_KEY?'Configured':'Missing credential';if(name==='gemini')return process.env.GEMINI_API_KEY?'Configured':'Missing credential';if(name==='groq')return process.env.GROQ_API_KEY?'Configured':'Missing credential';if(name==='ollama')return process.env.OLLAMA_BASE_URL?'Configured':'Disabled';return process.env.AI_API_KEY?'Configured':'Missing credential';}

type Log = {
  id: string;
  user_id: string | null;
  purpose: string;
  action_type: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  status: string;
  error_code: string | null;
  cache_hit: boolean;
  created_at: string;
};
export default async function Page() {
  const { db, profile } = await requirePage(true);
  admin(profile);
  const now = new Date(),
    today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [settingsResult, logsResult] = await Promise.all([
    db.from("ai_tutor_settings").select("*").eq("id", true).single(),
    db
      .from("ai_usage_logs")
      .select(
        "id,user_id,purpose,action_type,provider,model,input_tokens,output_tokens,latency_ms,status,error_code,cache_hit,created_at",
      )
      .gte("created_at", month.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);
  const settings = check(settingsResult) as Parameters<typeof AiSettingsForm>[0]["settings"];
  const logs = check(logsResult) as Log[];
  const tutor = logs.filter((row) => row.purpose === "TUTOR"),
    todayRows = tutor.filter((row) => new Date(row.created_at) >= today),
    cacheHits = tutor.filter((row) => row.cache_hit).length,
    providerCalls = tutor.filter((row) => !row.cache_hit && row.status === "SUCCEEDED").length,
    failures = tutor.filter((row) => row.status === "FAILED"),
    tokens = tutor.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0),
    unique = new Set(tutor.map((row) => row.user_id).filter(Boolean)).size;
  return (
    <>
      <p className="eyebrow">AI & analytics · financially safe controls</p>
      <h1>AI tutor usage</h1>
      <p>
        Credentials and prompt bodies are never displayed. The verified answer remains
        authoritative.
      </p>
      <AiSettingsForm settings={settings} />
      <AiProviderTests providers={["openrouter","gemini","groq","ollama","openai"].map(provider=>({provider:provider as "openrouter"|"gemini"|"groq"|"ollama"|"openai",status:providerStatus(provider),canTest:providerStatus(provider)==="Configured"}))}/>
      <div className="stats">
        <section className="card">
          <span className="muted">Requests today</span>
          <div className="metric">{todayRows.length}</div>
        </section>
        <section className="card">
          <span className="muted">Requests this month</span>
          <div className="metric">{tutor.length}</div>
        </section>
        <section className="card">
          <span className="muted">Unique students</span>
          <div className="metric">{unique}</div>
        </section>
        <section className="card">
          <span className="muted">Cache hit rate</span>
          <div className="metric">
            {tutor.length ? Math.round((cacheHits / tutor.length) * 100) : 0}%
          </div>
          <small>{cacheHits} provider calls avoided</small>
        </section>
        <section className="card">
          <span className="muted">Provider calls</span>
          <div className="metric">{providerCalls}</div>
        </section>
        <section className="card">
          <span className="muted">Failures / limits</span>
          <div className="metric">{failures.length}</div>
        </section>
        <section className="card">
          <span className="muted">Tokens reported</span>
          <div className="metric">{tokens}</div>
        </section>
      </div>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Provider / model</th>
              <th>Status</th>
              <th>Cache</th>
              <th>Latency</th>
              <th>Usage</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {tutor.slice(0, 100).map((row) => (
              <tr key={row.id}>
                <td>{row.action_type?.replaceAll("_", " ") ?? row.purpose}</td>
                <td>
                  {row.provider} / {row.model}
                </td>
                <td>
                  <span className={`pill ${row.status === "FAILED" ? "attention" : ""}`}>
                    {row.error_code ?? row.status}
                  </span>
                </td>
                <td>{row.cache_hit ? "Hit" : "Provider"}</td>
                <td>{row.latency_ms} ms</td>
                <td>{row.input_tokens + row.output_tokens} tokens</td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tutor.length ? (
          <div className="empty-state">
            <h2>No AI tutor usage this month</h2>
            <p>The verified explanation remains available when AI is disabled or unconfigured.</p>
          </div>
        ) : null}
      </div>
    </>
  );
}
