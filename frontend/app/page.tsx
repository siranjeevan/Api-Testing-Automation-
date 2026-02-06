"use client";
import React from 'react';
import styles from './page.module.css';
import { ApiEndpoint, TestExecutionResult } from './types';

export default function Home() {
    const [sidebarExpanded, setSidebarExpanded] = React.useState(true);
    const [selectedTag, setSelectedTag] = React.useState<string | null>(null);
    const [autoParams, setAutoParams] = React.useState<Record<string, string>>({});
    const [errorDrawerOpen, setErrorDrawerOpen] = React.useState(false);
    const [warningDrawerOpen, setWarningDrawerOpen] = React.useState(false);
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
                    setConfig((prev: any) => ({ ...prev, baseUrl: detectedUrl }));
                }

                setTab('run-get');
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

    const extractIdentifiers = (data: any) => {
        const found: Record<string, string> = {};
        const scan = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) {
                obj.forEach(scan);
                return;
            }
            Object.entries(obj).forEach(([key, val]) => {
                // PRIORITIZE FIRST FOUND: Do not overwrite if key already exists.
                // This ensures we save the ID of the first item in a list, which is usually the intended consistency target.
                if (found[key]) return;

                if (val !== null && (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')) {
                    found[key] = String(val);
                } else {
                    scan(val);
                }
            });
        };
        scan(data);
        return found;
    };

    const categories = Array.from(new Set(endpoints.flatMap(ep => ep.tags || ['General']))).sort();
    const isRealError = (r: TestExecutionResult) => {
        if (r.passed) return false;
        
        // 1. Ignore 404s explicitly
        if (r.status === 404) return false;

        // 2. Ignore "Not Found" text patterns in the entire response body
        const responseStr = JSON.stringify(r.response || "").toLowerCase();
        const errorStr = (r.error || "").toLowerCase();
        
        if (responseStr.includes("not found") || errorStr.includes("not found")) return false;
        
        return true;
    };
    const failedCount = results.filter(isRealError).length;
    const warningCount = results.filter(r => !r.passed && !isRealError(r)).length;

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


                {(tab === 'run-get' || tab === 'run-post' || tab === 'run-upload') && (
                    <div className={styles.suiteContainer}>
                        {(() => {
                            const m = tab === 'run-get' ? 'GET' : tab === 'run-post' ? 'POST' : undefined;
                            const isUpload = tab === 'run-upload';
                            const filtered = endpoints.filter(ep => {
                                const path = ep.path.toLowerCase();
                                const isUp = path.includes('upload') || path.includes('image') || path.includes('file');
                                if (isUpload) return isUp;
                                if (m) return ep.method.toUpperCase() === m && !isUp;
                                return false;
                            });

                            const suiteResults = filtered.map(ep => getResult(ep)).filter(Boolean);
                            const passedCount = suiteResults.filter(r => r?.passed).length;
                            const failedCount = suiteResults.length - passedCount;

                            // Extract unique tags and counts for the selector
                            const tagCounts = filtered.reduce((acc, ep) => {
                                const epTags = ep.tags || ['General'];
                                epTags.forEach(t => {
                                    acc[t] = (acc[t] || 0) + 1;
                                });
                                return acc;
                            }, {} as Record<string, number>);
                            
                            const uniqueTags = Object.keys(tagCounts).sort();
                            const activeTag = selectedTag || 'All';

                            return (
                                <>
                                    <div className={styles.suiteHeader}>
                                        <div className={styles.suiteTitleGroup}>
                                            <h2 className="animate-in fade-in slide-in-from-left-4 duration-700">
                                                {tab === 'run-get' && 'GET Suite.'}
                                                {tab === 'run-post' && 'POST Suite.'}
                                                {tab === 'run-upload' && 'Upload Suite.'}
                                            </h2>
                                            <p className="animate-in fade-in slide-in-from-left-4 duration-1000">Automated validation of {filtered.length} system endpoints.</p>
                                        </div>

                                        <div className="flex items-center gap-12">
                                            <div className={styles.suiteStats}>
                                                <div className={styles.statItem}>
                                                    <span className={styles.statValue}>{filtered.length}</span>
                                                    <span className={styles.statLabel}>Total</span>
                                                </div>
                                                <div className={styles.statItem}>
                                                    <span className={styles.statValue} style={{ color: '#10b981' }}>{passedCount}</span>
                                                    <span className={styles.statLabel}>Passed</span>
                                                </div>
                                                <div className={styles.statItem}>
                                                    <span className={styles.statValue} style={{ color: '#f43f5e' }}>{failedCount}</span>
                                                    <span className={styles.statLabel}>Failed</span>
                                                </div>
                                            </div>

                                            <button 
                                                className={styles.runAllButton}
                                                onClick={async () => {
                                                    setLoading(true);
                                                    // Clear results for the filtered suite
                                                    setResults(prev => prev.filter(r => !filtered.some(f => f.path === r.endpoint && f.method === r.method)));
                                                    
                                                    // 1. Sort: Producers (no vars) first, Consumers (vars) last
                                                    const sortedEndpoints = [...filtered].sort((a, b) => {
                                                        const aHasVars = a.path.includes('{');
                                                        const bHasVars = b.path.includes('{');
                                                        if (aHasVars === bHasVars) return 0;
                                                        return aHasVars ? 1 : -1;
                                                    });

                                                    // 2. Local Context Accumulator
                                                    let currentContext = { ...autoParams };

                                                    // 3. Sequential Execution Strategy
                                                    for (const ep of sortedEndpoints) {
                                                        try {
                                                            // a. Smart Resolve
                                                            let resolvedPath = ep.path;
                                                            const placeholders = ep.path.match(/\{([^}]+)\}/g) || [];
                                                            
                                                            placeholders.forEach(p => {
                                                                const key = p.slice(1, -1);
                                                                // Resolution Priority: Exact Match -> 'id' Fallback (only for ID fields)
                                                                const fallback = key.toLowerCase().includes('id') ? (currentContext['id'] || currentContext['uuid']) : null;
                                                                const val = currentContext[key] || fallback;
                                                                if (val) {
                                                                    resolvedPath = resolvedPath.replace(p, val);
                                                                }
                                                            });

                                                            // b. Execute Single
                                                            const resolvedEp = { ...ep, path: resolvedPath };
                                                            const res = await fetch('http://localhost:8000/run', {
                                                                method: 'POST', 
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ 
                                                                    baseUrl: config.baseUrl, 
                                                                    endpoints: [resolvedEp], // Array of 1
                                                                    testData: JSON.parse(testData), 
                                                                    variables: {} 
                                                                })
                                                            });
                                                            
                                                            const data = await res.json();
                                                            
                                                            // c. Learning Phase (Extract IDs)
                                                            if (data.results && data.results.length > 0) {
                                                                const resultItem = data.results[0];
                                                                
                                                                // Map back to original parameterized path for UI
                                                                if (resolvedPath !== ep.path) {
                                                                    resultItem.endpoint = ep.path; 
                                                                }

                                                                setResults(prev => [...prev, resultItem]);

                                                                if (resultItem.response) {
                                                                    const learned = extractIdentifiers(resultItem.response);

                                                                    // Contextual Aliasing: Map 'id' to specific aliases (e.g. driver_id)
                                                                    const pathSegments = ep.path.split('/').filter(Boolean);
                                                                    const lastSegment = pathSegments[pathSegments.length - 1];
                                                                    if (lastSegment && !lastSegment.includes('{')) {
                                                                        const singular = lastSegment.endsWith('s') ? lastSegment.slice(0, -1) : lastSegment;
                                                                        
                                                                        ['id', 'uuid', '_id', 'userId'].forEach(idKey => {
                                                                            if (learned[idKey]) {
                                                                                learned[`${singular}_id`] = learned[idKey];
                                                                                learned[`${singular}Id`] = learned[idKey];
                                                                                learned[`${singular}Of`] = learned[idKey];
                                                                            }
                                                                        });
                                                                    }

                                                                    currentContext = { ...currentContext, ...learned };
                                                                }
                                                            }

                                                            // Small delay for UI smoothness
                                                            await new Promise(r => setTimeout(r, 20));

                                                        } catch (e) {
                                                            console.error("Execution error:", e);
                                                        }
                                                    }

                                                    // 4. Sync Global Knowledge
                                                    setAutoParams(currentContext);
                                                    setLoading(false);
                                                }}
                                                disabled={loading}
                                            >
                                                {loading ? (
                                                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                                ) : (
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 3l14 9-14 9V3z"/></svg>
                                                )}
                                                <span>Execute Full Suite</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className={styles.tagNav}>
                                        <button 
                                            className={`${styles.tagPill} ${activeTag === 'All' ? styles.active : ''}`}
                                            onClick={() => setSelectedTag('All')}
                                        >
                                            <span>All Categories</span>
                                            <span className={styles.tagCount}>{filtered.length}</span>
                                        </button>
                                        {uniqueTags.map(tag => (
                                            <button 
                                                key={tag}
                                                className={`${styles.tagPill} ${activeTag === tag ? styles.active : ''}`}
                                                onClick={() => setSelectedTag(tag)}
                                            >
                                                <span>{tag}</span>
                                                <span className={styles.tagCount}>{tagCounts[tag]}</span>
                                            </button>
                                        ))}
                                    </div>

                                    <div className={styles.suiteGrid}>
                                        {filtered.length === 0 ? (
                                            <div className="col-span-full py-32 text-center">
                                                <p className="text-dim text-lg">No endpoints detected in this category.</p>
                                            </div>
                                        ) : (
                                            Object.entries(
                                                filtered.reduce((acc, ep) => {
                                                    const tag = ep.tags?.[0] || 'General';
                                                    if (!acc[tag]) acc[tag] = [];
                                                    acc[tag].push(ep);
                                                    return acc;
                                                }, {} as Record<string, typeof filtered>)
                                            )
                                            .filter(([tag]) => activeTag === 'All' || activeTag === tag)
                                            .map(([tag, categoryEndpoints], catIdx) => (
                                                <div key={tag} className={styles.categorySection}>
                                                    <div className={styles.categoryLabel}>
                                                        <div className={styles.catLabelGroup}>
                                                            <h3>{tag}</h3>
                                                            <span className={styles.count}>{categoryEndpoints.length}</span>
                                                        </div>
                                                        <button 
                                                            className={styles.catRunButton}
                                                            disabled={loading}
                                                            onClick={async () => {
                                                                setLoading(true);
                                                                // Clear results for these endpoints
                                                                setResults(prev => prev.filter(r => !categoryEndpoints.some(f => f.path === r.endpoint && f.method === r.method)));
                                                                
                                                                // 1. Sort: Producers (no vars) first, Consumers (vars) last
                                                                const sortedEndpoints = [...categoryEndpoints].sort((a, b) => {
                                                                    const aHasVars = a.path.includes('{');
                                                                    const bHasVars = b.path.includes('{');
                                                                    if (aHasVars === bHasVars) return 0;
                                                                    return aHasVars ? 1 : -1;
                                                                });

                                                                // 2. Local Context Accumulator
                                                                let currentContext = { ...autoParams };

                                                                // 3. Sequential Execution Strategy
                                                                for (const ep of sortedEndpoints) {
                                                                    try {
                                                                        // a. Smart Resolve
                                                                        let resolvedPath = ep.path;
                                                                        const placeholders = ep.path.match(/\{([^}]+)\}/g) || [];
                                                                        
                                                                        placeholders.forEach(p => {
                                                                            const key = p.slice(1, -1);
                                                                            // Resolution Priority: Exact Match -> 'id' Fallback (only for ID fields)
                                                                            const fallback = key.toLowerCase().includes('id') ? (currentContext['id'] || currentContext['uuid']) : null;
                                                                            const val = currentContext[key] || fallback;
                                                                            if (val) {
                                                                                resolvedPath = resolvedPath.replace(p, val);
                                                                            }
                                                                        });

                                                                        // b. Execute Single
                                                                        const resolvedEp = { ...ep, path: resolvedPath };
                                                                        const res = await fetch('http://localhost:8000/run', {
                                                                            method: 'POST', 
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify({ 
                                                                                baseUrl: config.baseUrl, 
                                                                                endpoints: [resolvedEp], // Array of 1
                                                                                testData: JSON.parse(testData), 
                                                                                variables: {} 
                                                                            })
                                                                        });
                                                                        
                                                                        const data = await res.json();
                                                                        
                                                                        // c. Learning Phase (Extract IDs)
                                                                        if (data.results && data.results.length > 0) {
                                                                            const resultItem = data.results[0];
                                                                            
                                                                            // Fix: Ensure the result maps back to the original parameterized path for UI matching
                                                                            if (resolvedPath !== ep.path) {
                                                                                resultItem.endpoint = ep.path; 
                                                                            }

                                                                            setResults(prev => [...prev, resultItem]);

                                                                            if (resultItem.response) {
                                                                                const learned = extractIdentifiers(resultItem.response);
                                                                                
                                                                                // Contextual Aliasing: Map 'id' to specific aliases (e.g. driver_id, driverId)
                                                                                const pathSegments = ep.path.split('/').filter(Boolean);
                                                                                const lastSegment = pathSegments[pathSegments.length - 1];
                                                                                if (lastSegment && !lastSegment.includes('{')) {
                                                                                    // Drivers -> driver
                                                                                    const singular = lastSegment.endsWith('s') ? lastSegment.slice(0, -1) : lastSegment;
                                                                                    
                                                                                    // Map common ID keys to specific aliases
                                                                                    ['id', 'uuid', '_id', 'userId'].forEach(idKey => {
                                                                                        if (learned[idKey]) {
                                                                                            learned[`${singular}_id`] = learned[idKey]; // vehicle_id
                                                                                            learned[`${singular}Id`] = learned[idKey];  // vehicleId
                                                                                            learned[`${singular}Of`] = learned[idKey];  // vehicleOf
                                                                                        }
                                                                                    });
                                                                                }
                                                                                
                                                                                currentContext = { ...currentContext, ...learned };
                                                                            }
                                                                        }

                                                                        // Small delay for UI smoothness
                                                                        await new Promise(r => setTimeout(r, 50));

                                                                    } catch (e) {
                                                                        console.error("Execution error:", e);
                                                                    }
                                                                }

                                                                // 4. Sync Global Knowledge
                                                                setAutoParams(currentContext);
                                                                setLoading(false);
                                                            }}
                                                        >
                                                            {loading ? (
                                                                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                                            ) : (
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 3l10 9-10 9V3z"/></svg>
                                                            )}
                                                            Execute Category
                                                        </button>
                                                    </div>
                                                    <div className={styles.categoryGrid}>
                                                        {categoryEndpoints.map((ep, i) => {
                                                            const res = getResult(ep);
                                                            const placeholders = ep.path.match(/\{([^}]+)\}/g) || [];
                                                            const resolvePath = (path: string) => {
                                                                let resolved = path;
                                                                placeholders.forEach(p => {
                                                                    const key = p.slice(1, -1);
                                                                    // Strict mapping first. Only fallback to generic 'id' if the placeholder looks like an ID.
                                                                    const fallback = key.toLowerCase().includes('id') ? (autoParams['id'] || autoParams['uuid']) : null;
                                                                    const val = autoParams[key] || fallback;
                                                                    if (val) {
                                                                        resolved = resolved.replace(p, val);
                                                                    }
                                                                });
                                                                return resolved;
                                                            };

                                                            const updateAutoParams = (responseData: any) => {
                                                                const learned = extractIdentifiers(responseData);
                                                                
                                                                // Contextual Aliasing: Map 'id' to specific aliases (e.g. driver_id, driverId)
                                                                const pathSegments = ep.path.split('/').filter(Boolean);
                                                                const lastSegment = pathSegments[pathSegments.length - 1];
                                                                if (lastSegment && !lastSegment.includes('{')) {
                                                                    const singular = lastSegment.endsWith('s') ? lastSegment.slice(0, -1) : lastSegment;
                                                                    
                                                                    ['id', 'uuid', '_id', 'userId'].forEach(idKey => {
                                                                        if (learned[idKey]) {
                                                                            learned[`${singular}_id`] = learned[idKey];
                                                                            learned[`${singular}Id`] = learned[idKey];
                                                                            learned[`${singular}Of`] = learned[idKey];
                                                                        }
                                                                    });
                                                                }

                                                                setAutoParams(prev => ({ ...prev, ...learned }));
                                                            };

                                                            const runEndpoint = async (singleEp: typeof ep) => {
                                                                setLoading(true);
                                                                setResults(prev => prev.filter(r => !(r.endpoint === singleEp.path && r.method === singleEp.method)));
                                                                try {
                                                                    const resolvedEp = { ...singleEp, path: resolvePath(singleEp.path) };
                                                                    const r = await fetch('http://localhost:8000/run', {
                                                                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ baseUrl: config.baseUrl, endpoints: [resolvedEp], testData: JSON.parse(testData), variables: {} })
                                                                    });
                                                                    const data = await r.json();
                                                                    setResults(prev => [...prev, ...data.results]);
                                                                    if (data.results?.[0]?.response) {
                                                                        updateAutoParams(data.results[0].response);
                                                                    }
                                                                } catch (e) { console.error(e); }
                                                                finally { setLoading(false); }
                                                            };

                                                            return (
                                                                <div key={i} className={styles.endpointTile}>
                                                                    <div className={styles.tileHeader}>
                                                                        <div className={styles.tilePath}>{ep.path}</div>
                                                                        <button 
                                                                            className={styles.tileMethod}
                                                                            disabled={loading}
                                                                            onClick={() => runEndpoint(ep)}
                                                                        >
                                                                            {loading ? (
                                                                                <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                                                            ) : (
                                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 3l14 9-14 9V3z"/></svg>
                                                                            )}
                                                                            {ep.method}
                                                                        </button>
                                                                    </div>
                                                                    
                                                                    {ep.summary && <p className="text-xs text-muted leading-relaxed line-clamp-2">{ep.summary}</p>}

                                                                    {res && (
                                                                        <div className="animate-in fade-in duration-500">
                                                                            <div className={styles.tileInfo}>
                                                                                <div className={styles.tileTime}>{res.time.toFixed(0)} MS</div>
                                                                                <div className={`${styles.status} ${res.passed ? styles.pass : styles.fail}`}>
                                                                                    <div className={`w-1.5 h-1.5 rounded-full ${res.passed ? 'bg-success' : 'bg-error'}`}></div>
                                                                                    {res.passed ? 'Passed' : 'Failed'}
                                                                                </div>
                                                                            </div>

                                                                            <div className={styles.inspectorBox}>
                                                                                <pre>{JSON.stringify(res.response, null, 2)}</pre>
                                                                            </div>
                                                                            {res.error && <div className="text-[10px] text-error mt-2 font-mono">{res.error}</div>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )}
            </main>
            {/* Data Warning Toggle & Drawer */}
            <div className={`${styles.drawerBackdrop} ${warningDrawerOpen || errorDrawerOpen ? styles.active : ''}`} onClick={() => {
                setWarningDrawerOpen(false);
                setErrorDrawerOpen(false);
            }} />
            
            {warningCount > 0 && (
                <>
                    <button 
                        className={styles.warningToggle} 
                        onClick={() => setWarningDrawerOpen(true)}
                        style={{ bottom: failedCount > 0 ? '90px' : '32px' }}
                    >
                        <span>{warningCount} No Data</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    </button>

                    <div className={`${styles.errorDrawer} ${warningDrawerOpen ? styles.open : ''}`}>
                        <div className={styles.drawerHeader} style={{borderBottom: '1px solid rgba(245, 158, 11, 0.1)'}}>
                            <div className={styles.drawerTitle} style={{color: '#d97706'}}>Missing Data ({warningCount})</div>
                            <button className={styles.closeButton} onClick={() => setWarningDrawerOpen(false)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        </div>
                        <div className={styles.drawerContent}>
                            <div className={styles.errorGrid}>
                            {(() => {
                                const allWarnings = results.filter(r => !r.passed && !isRealError(r));
                                if (allWarnings.length === 0) return null;
                                
                                return allWarnings.map((fail, idx) => {
                                    const epDef = endpoints.find(e => e.path === fail.endpoint && e.method === fail.method);
                                    // Use the first tag as the category label, default to 'General'
                                    const category = epDef?.tags?.[0] || 'General'; 
                                    
                                    return (
                                        <div key={idx} className={styles.warningItem}>
                                            <div className={styles.cardHeader} style={{marginBottom: '8px'}}>
                                                <div style={{fontSize: '0.65rem', fontWeight: 800, color: '#d97706', textTransform: 'uppercase', letterSpacing:'0.05em'}}>
                                                    {category}
                                                </div>
                                            </div>
                                            <div className={styles.cardHeader}>
                                                <div className={styles.cardPath}>{fail.endpoint}</div>
                                                <div className={styles.cardMethod}>{fail.method}</div>
                                            </div>
                                            
                                            <div className={styles.cardSummary}>
                                                {epDef?.summary || 'Endpoint Execution'}
                                            </div>

                                            <div className={styles.cardMeta}>
                                                <div className={styles.cardTime}>{Math.round(fail.time)} MS</div>
                                                <div className={`${styles.cardStatus} ${styles.warning}`}>NO DATA</div>
                                            </div>

                                            <div className={styles.cardCodeBlock}>
                                                <pre>{JSON.stringify(fail.response?.detail || fail.response || "No Data Found", null, 2)}</pre>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Error Toggle & Drawer */}
            {failedCount > 0 && (
                <>
                    <button 
                        className={styles.errorToggle} 
                        onClick={() => setErrorDrawerOpen(true)}
                    >
                        <span>{failedCount} Errors</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>

                    <div className={`${styles.errorDrawer} ${errorDrawerOpen ? styles.open : ''}`}>
                        <div className={styles.drawerHeader}>
                            <div className={styles.drawerTitle}>Failed Requests ({failedCount})</div>
                            <button className={styles.closeButton} onClick={() => setErrorDrawerOpen(false)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        </div>
                        <div className={styles.drawerContent}>
                            <div className={styles.errorGrid}>
                            {(() => {
                                const allFailures = results.filter(r => isRealError(r));
                                if (allFailures.length === 0) return null;

                                return allFailures.map((fail, idx) => {
                                    const epDef = endpoints.find(e => e.path === fail.endpoint && e.method === fail.method);
                                    const category = epDef?.tags?.[0] || 'General';

                                    return (
                                        <div key={idx} className={styles.errorItem}>
                                            <div className={styles.cardHeader} style={{marginBottom: '8px'}}>
                                                <div style={{fontSize: '0.65rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing:'0.05em'}}>
                                                    {category}
                                                </div>
                                            </div>
                                            <div className={styles.cardHeader}>
                                                <div className={styles.cardPath}>{fail.endpoint}</div>
                                                <div className={styles.cardMethod}>{fail.method}</div>
                                            </div>
                                            
                                            <div className={styles.cardSummary}>
                                                {epDef?.summary || 'Endpoint Execution'}
                                            </div>

                                            <div className={styles.cardMeta}>
                                                <div className={styles.cardTime}>{Math.round(fail.time)} MS</div>
                                                <div className={`${styles.cardStatus} ${styles.failed}`}>FAILED</div>
                                            </div>

                                            <div className={styles.cardCodeBlock}>
                                                <pre>{JSON.stringify(fail.response?.detail || fail.response || "Unknown Error", null, 2)}</pre>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
