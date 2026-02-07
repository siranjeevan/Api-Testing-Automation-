"use client";

import { useState } from "react";

interface ApiEndpoint {
  path: string;
  method: string;
  summary?: string;
  operationId?: string;
  tags: string[];
  parameters?: any[];
  requestBody?: any;
}

interface TestResult {
  endpoint: string;
  method: string;
  status: number;
  time: number;
  passed: boolean;
  response: any;
  error?: string;
}

export default function Home() {
  const [url, setUrl] = useState("https://api.cholacabs.in/openapi.json");
  const [baseUrl, setBaseUrl] = useState("https://api.cholacabs.in");
  const [apiKey, setApiKey] = useState("");
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [testData, setTestData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState<boolean>(false);

  const handleParse = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const response = await fetch("http://localhost:8000/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) throw new Error("Failed to parse API specification");
      const data = await response.json();
      setEndpoints(data.endpoints);
      
      if (data.raw?.servers && data.raw.servers.length > 0) {
        setBaseUrl(data.raw.servers[0].url);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!apiKey || endpoints.length === 0) return;
    setGenerating(true);
    try {
      const response = await fetch("http://localhost:8000/generate-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, endpoints }),
      });
      const data = await response.json();
      setTestData(data.testData || {});
    } catch (err) {
      console.error("AI Generation failed:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleRunTest = async (endpoint: ApiEndpoint) => {
    setRunning(true);
    try {
      const response = await fetch("http://localhost:8000/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          endpoints: [endpoint],
          testData: testData,
          variables: {
            "headers": { "Content-Type": "application/json" }
          }
        }),
      });

      const data = await response.json();
      setResults(prev => [...data.results, ...prev]);
    } catch (err: any) {
      console.error("Test failed:", err);
    } finally {
      setRunning(false);
    }
  };

  const getBadgeClass = (method: string) => {
    const m = method.toLowerCase();
    if (m === "get") return "badge-get";
    if (m === "post") return "badge-post";
    if (m === "put") return "badge-put";
    if (m === "delete") return "badge-delete";
    return "";
  };

  return (
    <main className="animate-fade-in">
      <header className="glass-header">
        <div className="container" style={{ height: "var(--header-height)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "32px", height: "32px", background: "var(--accent)", borderRadius: "8px", display: "grid", placeItems: "center", fontWeight: "bold" }}>A</div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em" }}>Antigravity <span style={{ color: "var(--accent)" }}>API</span></h1>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            {Object.keys(testData).length > 0 && (
              <div className="badge badge-post" style={{ borderRadius: "20px" }}>AI Data Ready</div>
            )}
            <div className="badge badge-get" style={{ borderRadius: "20px" }}>v1.0.0 Stable</div>
          </div>
        </div>
      </header>

      <div className="container">
        <div className="dashboard-grid">
          <aside className="glass" style={{ padding: "24px", height: "fit-content" }}>
            <h2 style={{ fontSize: "18px", marginBottom: "20px" }}>Configuration</h2>
            
            <div className="input-group">
              <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Swagger Definition URL</label>
              <input 
                type="text" 
                className="input-field" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="input-group" style={{ marginTop: "16px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Target Base URL</label>
              <input 
                type="text" 
                className="input-field" 
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>

            <div className="input-group" style={{ marginTop: "16px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Groq API Key (for AI Data)</label>
              <input 
                type="password" 
                className="input-field" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsk_..."
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "20px" }}>
              <button 
                className="btn btn-primary" 
                onClick={handleParse}
                disabled={loading}
                style={{ justifyContent: "center" }}
              >
                {loading ? "..." : "Refresh"}
              </button>
              <button 
                className="btn" 
                onClick={handleGenerateAI}
                disabled={generating || !apiKey || endpoints.length === 0}
                style={{ justifyContent: "center", background: "rgba(99, 102, 241, 0.1)", border: "1px solid var(--accent)", color: "var(--accent)" }}
              >
                {generating ? "..." : "AI Data"}
              </button>
            </div>

            {error && (
              <div style={{ marginTop: "16px", padding: "12px", background: "rgba(239,68,68,0.1)", border: "1px solid var(--error)", color: "var(--error)", borderRadius: "8px", fontSize: "13px" }}>
                {error}
              </div>
            )}

            {results.length > 0 && (
              <div style={{ marginTop: "32px" }}>
                <h3 style={{ fontSize: "14px", marginBottom: "12px", color: "var(--text-secondary)" }}>Recent Executions</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {results.slice(0, 5).map((res, i) => (
                    <div key={i} className="glass" style={{ padding: "10px", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: res.passed ? "var(--success)" : "var(--error)" }}></div>
                      <span style={{ fontWeight: 700, minWidth: "35px" }}>{res.method}</span>
                      <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", flex: 1 }}>{res.endpoint}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "20px" }}>Endpoints ({endpoints.length})</h2>
              {Object.keys(testData).length > 0 && (
                <span style={{ fontSize: "11px", color: "var(--success)" }}>✨ AI Payloads Active</span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {endpoints.length === 0 && !loading && (
                <div className="glass" style={{ padding: "64px", textAlign: "center", color: "var(--text-secondary)" }}>
                  <div style={{ fontSize: "40px", marginBottom: "16px" }}>📡</div>
                  Parse a swagger file to start testing
                </div>
              )}

              {endpoints.map((ep, idx) => {
                const latestRes = results.find(r => r.endpoint === ep.path && r.method === ep.method);
                const opId = ep.operationId || `${ep.method}_${ep.path}`;
                const hasAIData = testData[opId] ? true : false;

                return (
                  <div 
                    key={idx} 
                    className="glass animate-fade-in" 
                    style={{ 
                      padding: "16px 20px", 
                      borderLeft: latestRes ? `4px solid ${latestRes.passed ? "var(--success)" : "var(--error)"}` : hasAIData ? "4px solid var(--accent)" : "1px solid var(--border-card)",
                      animationDelay: `${idx * 0.05}s`
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <span className={`badge ${getBadgeClass(ep.method)}`} style={{ minWidth: "65px", textAlign: "center" }}>
                        {ep.method}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "15px", fontWeight: 600 }}>{ep.path}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                          {ep.summary || "No description"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {latestRes && (
                          <div style={{ marginRight: "12px", textAlign: "right" }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: latestRes.passed ? "var(--success)" : "var(--error)" }}>
                              {latestRes.status} {latestRes.passed ? "OK" : "FAIL"}
                            </div>
                            <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{latestRes.time.toFixed(0)}ms</div>
                          </div>
                        )}
                        <button 
                          className="btn btn-primary" 
                          onClick={() => handleRunTest(ep)}
                          disabled={running}
                          style={{ padding: "8px 16px", fontSize: "12px" }}
                        >
                          {running ? "..." : "Execute"}
                        </button>
                      </div>
                    </div>
                    
                    {latestRes && (
                      <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border-card)" }}>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "6px" }}>Response Body</div>
                        <pre style={{ 
                          fontSize: "11px", 
                          background: "rgba(0,0,0,0.3)", 
                          padding: "12px", 
                          borderRadius: "8px", 
                          maxHeight: "150px", 
                          overflow: "auto",
                          color: "#99f6e4"
                        }}>
                          {JSON.stringify(latestRes.response || latestRes.error, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
