"use client";
import React, { useState } from 'react';
import styles from './page.module.css';
import { ApiEndpoint, TestExecutionResult } from './types';

export default function Home() {
    const [sidebarExpanded, setSidebarExpanded] = React.useState(true);
    const [config, setConfig] = React.useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ag_config');
            return saved ? JSON.parse(saved) : {
                baseUrl: 'http://localhost:8000',
                openapiUrl: 'http://localhost:8000/openapi.json',
                environment: 'local',
                apiKey: ''
            };
        }
        return { baseUrl: '', openapiUrl: '', environment: 'local', apiKey: '' };
    });
    const [endpoints, setEndpoints] = React.useState<ApiEndpoint[]>([]);
    const [testData, setTestData] = React.useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ag_test_data');
            return saved || '{\n  "users": []\n}';
        }
        return '{\n  "users": []\n}';
    });
    const [results, setResults] = React.useState<TestExecutionResult[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [tab, setTab] = React.useState('setup');

    React.useEffect(() => {
        localStorage.setItem('ag_config', JSON.stringify(config));
    }, [config]);

    React.useEffect(() => {
        localStorage.setItem('ag_test_data', testData);
    }, [testData]);

    const parseSwagger = async () => {
        setLoading(true);

        try {
            const res = await fetch('http://localhost:8000/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: config.openapiUrl })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to fetch');
            }

            const data = await res.json();
            if (data.endpoints) {
                setEndpoints(data.endpoints);

                // Auto-detect and set Base URL from server definition or origin
                let detectedUrl = '';
                if (data.raw?.servers?.length > 0) {
                    detectedUrl = data.raw.servers[0].url;
                }

                // If server URL is relative or missing, derive from OpenAPI URL
                if (!detectedUrl || !detectedUrl.startsWith('http')) {
                    try {
                        const urlObj = new URL(config.openapiUrl);
                        detectedUrl = urlObj.origin;
                    } catch (e) { }
                }

                if (detectedUrl) {
                    setConfig(prev => ({ ...prev, baseUrl: detectedUrl }));
                }

                setTab('data');
            }
        } catch (e: any) {
            console.error(e);
            alert(`Error: ${e.message || 'Failed to parse Swagger'}`);
        } finally {
            setLoading(false);
        }
    };

    const runTests = async (methodFilter?: string) => {
        if (!config.baseUrl) {
            alert("Please set a Target Base URL in the Setup tab.");
            setTab('setup');
            return;
        }
        
        const targetEndpoints = methodFilter 
            ? endpoints.filter(ep => ep.method.toUpperCase() === methodFilter.toUpperCase())
            : endpoints;

        if (targetEndpoints.length === 0) {
            alert(`No ${methodFilter || ''} endpoints found to run.`);
            return;
        }

        setTab('run');
        setLoading(true);
        // We only clear results for the endpoints we are about to run
        setResults(prev => prev.filter(r => !targetEndpoints.some(te => te.path === r.endpoint && te.method === r.method)));

        try {
            const res = await fetch('http://localhost:8000/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baseUrl: config.baseUrl,
                    endpoints: targetEndpoints,
                    testData: JSON.parse(testData),
                    variables: {}
                })
            });
            const data = await res.json();
            setResults(prev => [...prev, ...data.results]);
        } catch (e) {
            alert('Error running tests');
        } finally {
            setLoading(false);
        }
    };

    const generateData = async () => {
        if (!config.apiKey) {
            alert("Please enter a Groq API Key in Setup tab first.");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('http://localhost:8000/generate-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: config.apiKey,
                    endpoints: endpoints
                })
            });
            const data = await res.json();
            if (data.testData) {
                setTestData(JSON.stringify(data.testData, null, 2));
            }
        } catch (e) {
            alert("Failed to generate data");
        } finally {
            setLoading(false);
        }
    };

    const getResult = (ep: ApiEndpoint) => results.find(r => r.endpoint === ep.path && r.method === ep.method);

    return (
        <div className={styles.container}>
            <aside className={`${styles.sidebar} ${!sidebarExpanded ? styles.collapsed : ''}`}>
                <button 
                    className={styles.collapseToggle} 
                    onClick={() => setSidebarExpanded(!sidebarExpanded)}
                    title={sidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sidebarExpanded ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.3s ease' }}>
                        <polyline points="15 18 9 12 15 6"/>
                    </svg>
                </button>

                <div className={styles.logo}>
                    <div className={styles.logoIcon}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </div>
                    <h1 className="text-xl font-bold tracking-tight">AG Automation</h1>
                </div>
                <nav>
                    <div className={`${styles.navItem} ${tab === 'setup' ? styles.active : ''}`} onClick={() => setTab('setup')}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span>Configuration</span>
                    </div>
                    <div className={`${styles.navItem} ${tab === 'data' ? styles.active : ''}`} onClick={() => setTab('data')}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
                        <span>Test Data</span>
                    </div>
                    
                    <div className="mt-8 mb-2 px-4 text-[10px] uppercase tracking-widest text-dim font-bold opacity-50">Runners</div>
                    <div className={`${styles.navItem} ${tab === 'run-get' ? styles.active : ''}`} onClick={() => setTab('run-get')}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                        <span>GET Suite</span>
                    </div>
                    <div className={`${styles.navItem} ${tab === 'run-post' ? styles.active : ''}`} onClick={() => setTab('run-post')}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        <span>POST Suite</span>
                    </div>
                    <div className={`${styles.navItem} ${tab === 'run-upload' ? styles.active : ''}`} onClick={() => setTab('run-upload')}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span>Asset Uploads</span>
                    </div>
                </nav>
            </aside>
            <main className={styles.main}>
                {tab === 'setup' && (
                    <div className={styles.setupContainer}>
                        <div className={styles.setupIntro}>
                            <div>
                                <h2 className="text-5xl font-black tracking-tight leading-none mb-6">Initialize<br/>Workspace.</h2>
                                <p className="text-powder-blue/60 text-lg leading-relaxed max-w-sm">Connect your API blueprint and define target parameters to begin automated analysis.</p>
                            </div>

                            <div>
                                <div className={styles.statusRow}>
                                    <span className={styles.statusPill}>API ENGINE</span>
                                    <span className={styles.statusPill}>ENV MAPPING</span>
                                    <span className={styles.statusPill}>AI GEN</span>
                                </div>
                                <p className={styles.persistenceText}>
                                    AVIATION GRADE PERSISTENCE ACTIVE
                                </p>
                            </div>
                        </div>

                        <div className={styles.setupWorkspace}>
                            <div className={styles.setupGrid}>
                                <div className={styles.stepSection}>
                                    <div className={styles.stepHeader}>
                                        <div className={styles.stepNumber}>Phase 01</div>
                                        <h3 className={styles.stepTitle}>Blueprint Mapping</h3>
                                    </div>
                                    <div className={styles.card}>
                                        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                                            <label className={styles.label}>Swagger Source URL</label>
                                            <input
                                                className={styles.input}
                                                value={config.openapiUrl}
                                                onChange={e => setConfig({ ...config, openapiUrl: e.target.value })}
                                                placeholder="https://api.example.com/swagger.json"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.stepSection}>
                                    <div className={styles.stepHeader}>
                                        <div className={styles.stepNumber}>Phase 02</div>
                                        <h3 className={styles.stepTitle}>Execution Target</h3>
                                    </div>
                                    <div className={styles.card}>
                                        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                                            <label className={styles.label}>Environment Base URL</label>
                                            <input
                                                className={styles.input}
                                                value={config.baseUrl}
                                                onChange={e => setConfig({ ...config, baseUrl: e.target.value })}
                                                placeholder="https://api.production.com"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.stepSection}>
                                    <div className={styles.stepHeader}>
                                        <div className={styles.stepNumber}>Phase 03</div>
                                        <h3 className={styles.stepTitle}>Intelligence Key</h3>
                                    </div>
                                    <div className={styles.card}>
                                        <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                                            <label className={styles.label}>Groq Authorization</label>
                                            <input
                                                className={styles.input}
                                                value={config.apiKey}
                                                onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                                                placeholder="gsk_..."
                                                type="password"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {config.openapiUrl && config.baseUrl && (
                                <button className={`${styles.button} w-full py-5 text-lg rounded-xl mt-auto shadow-2xl`} onClick={parseSwagger} disabled={loading}>
                                    {loading ? (
                                        <div className="flex items-center justify-center gap-4">
                                            <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                            Initializing project context...
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center gap-4">
                                            <span>Finalize & Launch Workspace</span>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m12 14 4-4-4-4"/><path d="M4 14V4h16v10Z"/><path d="M2 20h20"/></svg>
                                        </div>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'data' && (
                    <div className="h-full flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
                        <div className={styles.header}>
                            <h2 className="text-xl font-bold">Mock Data Engine</h2>
                            <div className="flex gap-4">
                                <button className={`${styles.button} ${styles.secondary}`} onClick={generateData} disabled={loading}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
                                    AI Data Generation
                                </button>
                                <button className={styles.button} onClick={() => setTab('run-get')}>Prepare Runner</button>
                            </div>
                        </div>
                        <p className="text-sm text-dim mb-4">The engine expects JSON data keyed by operationId or path. Use variables like {"{variable_name}"} for dynamic data.</p>
                        <textarea
                            className={`${styles.input} flex-1 font-mono`}
                            value={testData}
                            onChange={e => setTestData(e.target.value)}
                            style={{ minHeight: '400px', background: 'rgba(0,0,0,0.3)', color: '#f8fafc', padding: '24px', lineHeight: '1.6' }}
                        />
                    </div>
                )}

                {(tab === 'run-get' || tab === 'run-post' || tab === 'run-upload') && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className={styles.header}>
                            <h2 className="text-xl font-bold">
                                {tab === 'run-get' && 'Data Retrieval (GET)'}
                                {tab === 'run-post' && 'Data Creation (POST)'}
                                {tab === 'run-upload' && 'Asset Management (Upload)'}
                            </h2>
                            <button 
                                className={styles.button} 
                                onClick={() => {
                                    const m = tab === 'run-get' ? 'GET' : tab === 'run-post' ? 'POST' : undefined;
                                    const isUpload = tab === 'run-upload';
                                    const filtered = endpoints.filter(ep => {
                                        const path = ep.path.toLowerCase();
                                        const isUp = path.includes('upload') || path.includes('image') || path.includes('file');
                                        if (isUpload) return isUp;
                                        if (m) return ep.method.toUpperCase() === m && !isUp;
                                        return false;
                                    });
                                    const runFiltered = async () => {
                                        setLoading(true);
                                        setResults(prev => prev.filter(r => !filtered.some(f => f.path === r.endpoint && f.method === r.method)));
                                        try {
                                            const res = await fetch('http://localhost:8000/run', {
                                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ baseUrl: config.baseUrl, endpoints: filtered, testData: JSON.parse(testData), variables: {} })
                                            });
                                            const data = await res.json();
                                            setResults(prev => [...prev, ...data.results]);
                                        } catch (e) { console.error(e); }
                                        finally { setLoading(false); }
                                    };
                                    runFiltered();
                                }} 
                                disabled={loading}
                            >
                                {loading ? (
                                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                ) : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                                Execute Suite
                            </button>
                        </div>

                        <div className={styles.grid}>
                            <div className={styles.card}>
                                <div className="space-y-4">
                                    {(() => {
                                        const currentEndpoints = endpoints.filter(ep => {
                                            const path = ep.path.toLowerCase();
                                            const isUp = path.includes('upload') || path.includes('image') || path.includes('file');
                                            if (tab === 'run-upload') return isUp;
                                            if (tab === 'run-get') return ep.method.toUpperCase() === 'GET' && !isUp;
                                            if (tab === 'run-post') return ep.method.toUpperCase() === 'POST' && !isUp;
                                            return false;
                                        });

                                        if (currentEndpoints.length === 0) return <div className="text-dim py-20 text-center font-medium">No specialized endpoints detected for this category.</div>;

                                        return currentEndpoints.map((ep, i) => {
                                            const res = getResult(ep);
                                            return (
                                                <div key={i} className={styles.endpointCard}>
                                                    <div className={styles.endpointHeader}>
                                                        <div className="flex items-center gap-4">
                                                            <span className={`${styles.method} ${styles[ep.method.toLowerCase()]}`}>{ep.method}</span>
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-mono font-bold text-slate-100">{ep.path}</span>
                                                                {ep.summary && <span className="text-[11px] text-muted">{ep.summary}</span>}
                                                            </div>
                                                        </div>
                                                        {res && (
                                                            <div className="flex items-center gap-6">
                                                                <span className="text-[10px] uppercase tracking-widest font-bold text-dim">{res.time.toFixed(0)} ms</span>
                                                                <span className={`${styles.status} ${res.passed ? styles.pass : styles.fail}`}>
                                                                    {res.passed ? '✓ SUCCESS' : '✕ FAILED'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    {res && (
                                                        <details className="mt-2 group">
                                                            <summary className="list-none cursor-pointer text-[10px] font-bold text-dim hover:text-accent-primary uppercase tracking-widest flex items-center gap-2 select-none">
                                                                <svg className="group-open:rotate-90 transition-transform" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"/></svg>
                                                                Inspector
                                                            </summary>
                                                            <div className="mt-4 animate-in slide-in-from-top-2 duration-300">
                                                                <div className={styles.responseData}>
                                                                    <pre className="whitespace-pre-wrap break-all leading-relaxed">
                                                                        {JSON.stringify(res.response, null, 2)}
                                                                    </pre>
                                                                    {res.error && <div className="text-error mt-4 pt-4 border-t border-white/5 font-bold">Error: {res.error}</div>}
                                                                </div>
                                                            </div>
                                                        </details>
                                                    )}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
