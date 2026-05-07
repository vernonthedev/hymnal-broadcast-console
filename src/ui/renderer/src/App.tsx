import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ─── */
interface Runtime {
    version: string;
    httpPort: number;
    wsPort: number;
    dataDir: string;
    hymnsDir: string;
    token: string;
    overlayUrls: OverlayUrl[];
}

interface OverlayUrl {
    name: string;
    path: string;
    url: string;
}

interface Status {
    current_hymn: string;
    line_index: number;
    total_lines: number;
    text: string;
    previous_text: string;
    next_text: string;
    visible: boolean;
    connected_clients: number;
    style: Record<string, unknown>;
    presets: Record<string, unknown>;
    http_port?: number;
    ws_port?: number;
}

interface Hymn {
    number: string;
    preview: string;
}

declare global {
    interface Window {
        desktopApi: {
            getRuntime: () => Promise<Runtime | null>;
            copyText: (text: string) => Promise<boolean>;
            openExternal: (target: string) => Promise<boolean>;
            openPath: (target: string) => Promise<boolean>;
            getVersion: () => Promise<string>;
            getReleaseInfo: () => Promise<unknown>;
            minimizeWindow: () => Promise<boolean>;
            closeWindow: () => Promise<boolean>;
            onBackendEvent: (
                callback: (payload: unknown) => void
            ) => () => void;
        };
    }
}

/* ─── Constants ─── */
const MAX_FINDER_RESULTS = 10;

/* ─── Helpers ─── */
function escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function normalizeText(value: unknown): string {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function getHymnTitle(item: Hymn): string {
    const preview = String(item?.preview || "").trim();
    if (!preview) return "Untitled hymn";
    const firstLine = preview.split(/\r?\n/)[0].trim();
    const firstSegment = firstLine.split(/[-|:]/)[0].trim();
    return firstSegment || firstLine;
}

/* ─── Component ─── */
export default function App() {
    /* refs & state */
    const [serverPhase, setServerPhase] = useState("starting");
    const [serverMessage, setServerMessage] = useState("Server starting");
    const [runtime, setRuntime] = useState<Runtime | null>(null);
    const [status, setStatus] = useState<Status | null>(null);
    const [hymnIndex, setHymnIndex] = useState<Hymn[]>([]);
    const [presets, setPresets] = useState<Record<string, unknown>>({});
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Hymn[]>([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [toasts, setToasts] = useState<
        { id: number; msg: string; level: string }[]
    >([]);
    const [modal, setModal] = useState<{
        eyebrow: string;
        title: string;
        body: string;
    } | null>(null);
    const [selectedHymn, setSelectedHymn] = useState<Hymn | null>(null);
    const [appVersion, setAppVersion] = useState("");
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Use refs to avoid stale closures for functions that run outside render
    const runtimeRef = useRef<Runtime | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    const speakerRef = useRef<HTMLInputElement>(null);
    const fontSizeRef = useRef<HTMLSelectElement>(null);
    const alignmentRef = useRef<HTMLSelectElement>(null);
    const animationRef = useRef<HTMLSelectElement>(null);
    const safeMarginRef = useRef<HTMLInputElement>(null);
    const speakerTemplateRef = useRef<HTMLSelectElement>(null);
    const presetSelectRef = useRef<HTMLSelectElement>(null);
    const presetNameRef = useRef<HTMLInputElement>(null);

    // Keep runtime ref in sync
    useEffect(() => {
        runtimeRef.current = runtime;
    }, [runtime]);

    /* ─── Lifecycle ─── */
    useEffect(() => {
        let cleanup = () => {};
        init().then((c) => (cleanup = c));
        return () => cleanup();
    }, []);

    async function init() {
        const ver = await window.desktopApi.getVersion();
        setAppVersion(ver);
        const rt = await window.desktopApi.getRuntime();
        if (rt) {
            setRuntime(rt);
            connectSocket(rt);
            await refreshIndexes(rt);
        }
        const unsub = window.desktopApi.onBackendEvent((event: unknown) => {
            const ev = event as Record<string, unknown>;
            if (ev.type === "runtime") {
                const newRuntime = ev.runtime as Runtime;
                setRuntime(newRuntime);
                connectSocket(newRuntime);
                refreshIndexes(newRuntime);
            }
            if (ev.type === "status") {
                setStatus(ev.status as Status);
            }
            if (ev.type === "lifecycle") {
                setServerPhase(ev.phase as string);
                setServerMessage(ev.message as string);
            }
            if (ev.type === "toast") {
                showToast(ev.message as string, (ev.level as string) || "info");
            }
        });
        return unsub;
    }

    /* ─── HTTP API ─── */
    async function fetchJson(rt: Runtime, route: string): Promise<unknown> {
        const response = await fetch(`http://127.0.0.1:${rt.httpPort}${route}`);
        if (!response.ok) {
            throw new Error(`Request failed for ${route}: ${response.status}`);
        }
        return response.json();
    }

    async function refreshIndexes(rt: Runtime): Promise<void> {
        try {
            showToast("Loading hymns...", "info");
            const hymnsResponse = (await fetchJson(rt, "/hymns")) as Record<
                string,
                unknown
            >;
            const items = (hymnsResponse.items as Hymn[]) || [];
            setHymnIndex(items);
            showToast(`Loaded ${items.length} hymns`, "info");

            const presetsResponse = (await fetchJson(rt, "/presets")) as Record<
                string,
                unknown
            >;
            setPresets(
                (presetsResponse.items as Record<string, unknown>) || {}
            );
        } catch (error) {
            showToast(
                "Failed to load hymns: " + (error as Error).message,
                "error"
            );
        }
    }

    /* ─── WebSocket ─── */
    const isConnectingRef = useRef(false);

    function connectSocket(rt: Runtime) {
        if (socketRef.current) return;
        if (isConnectingRef.current) return;
        isConnectingRef.current = true;

        const ws = new WebSocket(`ws://127.0.0.1:${rt.wsPort}`);
        socketRef.current = ws;

        ws.addEventListener("open", () => {
            ws.send(
                JSON.stringify({
                    cmd: "hello",
                    role: "control",
                    token: rt.token,
                })
            );
        });

        ws.addEventListener("message", (event) => {
            const payload = JSON.parse(event.data);
            if (payload.type === "status") setStatus(payload.status);
            if (payload.type === "state") setStatus(payload);
            if (payload.type === "error") showToast(payload.message, "error");
            if (payload.type === "hymn_index")
                setHymnIndex(payload.items || []);
            if (payload.type === "presets") setPresets(payload.items || {});
            if (payload.type === "style") {
                setStatus((prev) =>
                    prev ? { ...prev, style: payload.style } : null
                );
            }
        });

        ws.addEventListener("close", () => {
            socketRef.current = null;
            isConnectingRef.current = false;
            // Reconnect after a delay
            setTimeout(() => {
                if (runtimeRef.current) {
                    connectSocket(runtimeRef.current);
                }
            }, 1200);
        });

        ws.addEventListener("error", () => {
            isConnectingRef.current = false;
        });
    }

    /* ─── Commands ─── */
    function sendCommand(payload: Record<string, unknown>) {
        const ws = socketRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            showToast("Backend socket is not ready.", "error");
            return;
        }
        ws.send(JSON.stringify(payload));
    }

    /* ─── Finder ─── */
    useEffect(() => {
        const normalized = normalizeText(query);
        if (!normalized) {
            setResults(hymnIndex.slice(0, MAX_FINDER_RESULTS));
            return;
        }
        const filtered = hymnIndex
            .filter((item) => {
                const number = normalizeText(item.number);
                const preview = normalizeText(item.preview);
                return (
                    number.startsWith(normalized) ||
                    preview.includes(normalized)
                );
            })
            .slice(0, MAX_FINDER_RESULTS);
        setResults(filtered);
        if (filtered.length > 0) {
            setPickerOpen(true);
        }
    }, [query, hymnIndex]);

    function selectHymn(number: string) {
        setQuery(number);
        setPickerOpen(false);
        const found = hymnIndex.find((h) => h.number === number) || null;
        setSelectedHymn(found);
    }

    function handleSearchAndLoad(hymn: Hymn) {
        selectHymn(hymn.number);
        sendCommand({ cmd: "load", hymn: hymn.number });
        setSearchModalOpen(false);
    }

    /* ─── Toasts ─── */
    function showToast(message: string, level = "info") {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, msg: message, level }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3500);
    }

    /* ─── Style form helpers ─── */
    function buildStylePayload() {
        return {
            fontSizePreset: fontSizeRef.current?.value || "md",
            alignment: alignmentRef.current?.value || "center",
            animation: animationRef.current?.value || "pop",
            safeMargin: Number(safeMarginRef.current?.value || 80),
            speakerLabel: speakerRef.current?.value.trim() || "",
        };
    }

    function queueStyleUpdate() {
        setTimeout(() => {
            sendCommand({ cmd: "update_style", style: buildStylePayload() });
        }, 180);
    }

    /* ─── Sync style form ─── */
    useEffect(() => {
        if (!status?.style) return;
        const s = status.style as Record<string, string | number>;
        if (fontSizeRef.current)
            fontSizeRef.current.value = (s.fontSizePreset as string) || "md";
        if (alignmentRef.current)
            alignmentRef.current.value = (s.alignment as string) || "center";
        if (animationRef.current)
            animationRef.current.value = (s.animation as string) || "pop";
        if (safeMarginRef.current)
            safeMarginRef.current.value = String(s.safeMargin ?? 80);
        if (speakerRef.current)
            speakerRef.current.value = (s.speakerLabel as string) || "";
        if (speakerTemplateRef.current)
            speakerTemplateRef.current.value = (s.speakerLabel as string) || "";
    }, [status?.style]);

    /* ─── Modal builders ─── */
    function openUrlsModal() {
        if (!runtime?.overlayUrls?.length) {
            setModal({
                eyebrow: "URLs",
                title: "Overlay URLs",
                body: "Overlay URLs will appear here once the backend runtime is available.",
            });
            return;
        }
        let html = `<div class="space-y-3">`;
        runtime.overlayUrls.forEach((o) => {
            html += `
        <div class="p-3 rounded-xl border bg-card/50 border-border/20 space-y-2">
          <div class="flex justify-between items-center">
            <strong class="text-sm font-bold">${escapeHtml(o.name)}</strong>
            <span class="text-xs text-muted-foreground">${escapeHtml(o.path)}</span>
          </div>
          <code class="block p-2 rounded-xl bg-muted text-xs break-all">${escapeHtml(o.url)}</code>
          <div class="flex gap-2">
            <button onclick="window._copyUrl('${escapeHtml(o.url)}')" class="flex-1 h-9 rounded-xl bg-secondary text-secondary-foreground text-xs border border-border/20 hover:bg-secondary/80 transition-colors">Copy</button>
            <button onclick="window._openUrl('${escapeHtml(o.url)}')" class="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs border border-primary/15 hover:bg-primary/90 transition-colors">Open</button>
          </div>
        </div>`;
        });
        html += `</div>`;
        setModal({ eyebrow: "URLs", title: "Overlay URLs", body: html });
    }

    // Expose for modal inline handlers
    (window as unknown as Record<string, unknown>)._copyUrl = async (
        url: string
    ) => {
        await window.desktopApi.copyText(url);
        showToast("URL copied.");
    };
    (window as unknown as Record<string, unknown>)._openUrl = async (
        url: string
    ) => {
        await window.desktopApi.openExternal(url);
    };

    function openHelpModal() {
        setModal({
            eyebrow: "Help",
            title: "Using the console",
            body: `
        <div class="space-y-3">
          <p class="text-muted-foreground text-sm">Use hymn number search to load lyrics quickly, then control progression with keyboard shortcuts or the transport buttons.</p>
          <div class="p-3 rounded-xl border bg-card/50 border-border/20">
            <div class="flex justify-between mb-1"><strong class="text-sm">Shortcuts</strong><span class="text-xs text-muted-foreground">Keyboard</span></div>
            <p class="text-sm text-muted-foreground">Enter Load selected hymn, Space Next line, Left Previous line, R Reset, B Blank.</p>
          </div>
          <div class="p-3 rounded-xl border bg-card/50 border-border/20">
            <div class="flex justify-between mb-1"><strong class="text-sm">Overlays</strong><span class="text-xs text-muted-foreground">OBS / vMix</span></div>
            <p class="text-sm text-muted-foreground">Copy overlay URLs from the URLs page or the right sidebar and use them as browser sources.</p>
          </div>
          <div class="p-3 rounded-xl border bg-card/50 border-border/20">
            <div class="flex justify-between mb-1"><strong class="text-sm">Theme Controls</strong><span class="text-xs text-muted-foreground">Live output</span></div>
            <p class="text-sm text-muted-foreground">Template, font size, alignment, animation, and safe margin update the live overlay style immediately.</p>
          </div>
        </div>
      `,
        });
    }

    function openAboutModal() {
        setModal({
            eyebrow: "About",
            title: "About this application",
            body: `
        <div class="space-y-3">
          <p class="text-muted-foreground text-sm">SDA Hymnal Desktop is a local broadcast console for loading hymn lyrics and sending live overlay updates to browser-based outputs.</p>
          <div class="p-3 rounded-xl border bg-card/50 border-border/20">
            <div class="flex justify-between mb-1"><strong class="text-sm">Developer</strong><span class="text-xs text-muted-foreground">vernonthedev</span></div>
            <p class="text-sm text-muted-foreground">https://vernon.skope.au</p>
          </div>
          <div class="p-3 rounded-xl border bg-card/50 border-border/20">
            <div class="flex justify-between mb-1"><strong class="text-sm">Version</strong><span class="text-xs text-muted-foreground">${escapeHtml(appVersion)}</span></div>
            <p class="text-sm text-muted-foreground">App version from Electron.</p>
          </div>
        </div>
      `,
        });
    }

    /* ─── Keyboard shortcuts ─── */
    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (searchModalOpen) {
                if (event.key === "Escape") {
                    setSearchModalOpen(false);
                }
                return;
            }
            if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLSelectElement
            ) {
                return;
            }
            if (event.key === "ArrowRight" || event.key === " ") {
                event.preventDefault();
                sendCommand({ cmd: "next" });
                return;
            }
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                sendCommand({ cmd: "prev" });
                return;
            }
            if (event.key.toLowerCase() === "r") {
                sendCommand({ cmd: "reset" });
                return;
            }
            if (event.key.toLowerCase() === "b") {
                sendCommand({ cmd: "blank" });
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [searchModalOpen]);

    /* ─── Focus search input when modal opens ─── */
    useEffect(() => {
        if (searchModalOpen && searchInputRef.current) {
            setTimeout(() => searchInputRef.current!.focus(), 50);
        }
    }, [searchModalOpen]);

    /* ─── Render ─── */
    return (
        <div className="app-shell bg-background text-foreground min-h-screen p-4.5 overflow-hidden">
            <div className="app-frame mx-auto max-w-[1180px] h-full flex flex-col gap-3.5 rounded-[1.25rem] bg-card/40 border border-border/50 backdrop-blur-xl p-3.5 overflow-hidden shadow-lg">
                {/* Header */}
                <header className="titlebar flex items-center justify-between gap-3 h-14 select-none">
                    <div className="flex items-center gap-2">
                        <div>
                            <p className="text-[0.68rem] font-extrabold tracking-[0.16em] uppercase text-primary">
                                SDA Hymnal Desktop
                            </p>
                            <h1 className="text-xl font-extrabold tracking-tight">
                                Hymn Broadcast Console
                            </h1>
                        </div>
                    </div>

                    <div className="titlebar-status flex flex-col gap-0.5 min-w-[180px] p-2.5 rounded-2xl bg-card/80 border border-border/40">
                        <span
                            className={`inline-flex items-center gap-2 text-sm font-bold ${
                                serverPhase === "running"
                                    ? "text-emerald-600"
                                    : serverPhase === "stopped"
                                      ? "text-destructive"
                                      : "text-amber-600"
                            }`}
                        >
                            <span
                                className={`w-2 h-2 rounded-full ${
                                    serverPhase === "running"
                                        ? "bg-emerald-500"
                                        : serverPhase === "stopped"
                                          ? "bg-destructive"
                                          : "bg-amber-500"
                                }`}
                            />
                            {serverMessage}
                        </span>
                        <span className="text-muted-foreground text-xs">
                            HTTP {status?.http_port || "-"}, WS{" "}
                            {status?.ws_port || "-"}
                        </span>
                    </div>

                    <div className="titlebar-actions flex items-center gap-2">
                        <button
                            onClick={() => setSearchModalOpen(true)}
                            className="h-11 px-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium border border-primary/15 hover:bg-primary/90 transition-colors"
                        >
                            Search
                        </button>
                        <button
                            onClick={() => openUrlsModal()}
                            className="h-11 px-3.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium border border-border/40 hover:bg-secondary/80 transition-colors"
                        >
                            URLs
                        </button>
                        <button
                            onClick={() => openHelpModal()}
                            className="h-11 px-3.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium border border-border/40 hover:bg-secondary/80 transition-colors"
                        >
                            Help
                        </button>
                        <button
                            onClick={() => openAboutModal()}
                            className="h-11 px-3.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium border border-border/40 hover:bg-secondary/80 transition-colors"
                        >
                            About
                        </button>
                        <button
                            onClick={() => sendCommand({ cmd: "reload_hymns" })}
                            className="h-11 px-3.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium border border-border/40 hover:bg-secondary/80 transition-colors"
                        >
                            Refresh
                        </button>
                        <button
                            onClick={async () => {
                                if (runtime?.hymnsDir)
                                    await window.desktopApi.openPath(
                                        runtime.hymnsDir
                                    );
                            }}
                            className="h-11 px-3.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium border border-border/40 hover:bg-secondary/80 transition-colors"
                        >
                            Hymns
                        </button>
                        <button
                            onClick={() => window.desktopApi.minimizeWindow()}
                            className="w-[34px] h-[34px] rounded-full bg-secondary text-secondary-foreground flex items-center justify-center border border-border/40 hover:bg-secondary/80 transition-colors"
                            aria-label="Minimize"
                        >
                            <span className="block w-3 h-0.5 rounded-full bg-current" />
                        </button>
                        <button
                            onClick={() => window.desktopApi.closeWindow()}
                            className="w-[34px] h-[34px] rounded-full bg-secondary text-secondary-foreground flex items-center justify-center border border-border/40 hover:bg-destructive/10 hover:text-destructive transition-colors"
                            aria-label="Close"
                        >
                            <span className="block w-2.5 h-2.5 relative">
                                <span className="absolute top-1/2 left-0 w-full h-0.5 rounded-full bg-current rotate-45" />
                                <span className="absolute top-1/2 left-0 w-full h-0.5 rounded-full bg-current -rotate-45" />
                            </span>
                        </button>
                    </div>
                </header>

                {/* Main Workspace */}
                <main className="workspace flex-1 overflow-hidden flex gap-3.5 min-h-0">
                    {/* Left Panel - Finder / Controls */}
                    <section className="panel finder-panel flex flex-col gap-2.5 w-[360px] min-h-0 p-4 rounded-[1.25rem] bg-card/60 border border-border/30 backdrop-blur-md overflow-y-auto">
                        <div className="panel-title-row flex items-center justify-between">
                            <div>
                                <p className="text-[0.68rem] font-extrabold tracking-[0.16em] uppercase text-primary">
                                    Main Feature
                                </p>
                                <h2 className="text-lg font-extrabold tracking-tight">
                                    Hymn Controls
                                </h2>
                            </div>
                            <span className="inline-flex items-center h-[34px] px-3 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/15">
                                Transport
                            </span>
                        </div>

                        <div className="p-3 rounded-xl bg-card/50 border border-border/20">
                            <span className="block mb-2 text-muted-foreground text-[0.7rem] font-bold uppercase tracking-wider">
                                Selection
                            </span>
                            <strong className="block text-sm font-bold text-foreground">
                                {selectedHymn
                                    ? `Hymn ${selectedHymn.number}`
                                    : "No hymn selected"}
                            </strong>
                            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                                {selectedHymn
                                    ? getHymnTitle(selectedHymn)
                                    : "Click Search to find and load a hymn."}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { key: "Enter", label: "Load" },
                                { key: "Space", label: "Next" },
                                { key: "Left", label: "Previous" },
                                { key: "R", label: "Reset" },
                            ].map((s) => (
                                <div
                                    key={s.key}
                                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-secondary/40 border border-border/20"
                                >
                                    <kbd className="inline-flex items-center justify-center min-w-[42px] px-2 py-1 rounded-lg bg-background border border-border/20 text-xs font-bold">
                                        {s.key}
                                    </kbd>
                                    <span className="text-xs text-muted-foreground font-medium">
                                        {s.label}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-auto">
                            {[
                                { label: "Previous", cmd: "prev" },
                                {
                                    label: "Next",
                                    cmd: "next",
                                    primary: true,
                                },
                                { label: "Reset", cmd: "reset" },
                                { label: "Blank", cmd: "blank" },
                                { label: "Show", cmd: "show" },
                                { label: "Retrigger", cmd: "retrigger" },
                            ].map((btn) => (
                                <button
                                    key={btn.cmd}
                                    onClick={() =>
                                        sendCommand({ cmd: btn.cmd })
                                    }
                                    className={`h-10 px-3 rounded-xl font-bold text-sm border transition-colors ${
                                        btn.primary
                                            ? "bg-primary text-primary-foreground border-primary/15 hover:bg-primary/90"
                                            : "bg-secondary text-secondary-foreground border-border/30 hover:bg-secondary/80"
                                    }`}
                                >
                                    {btn.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Middle Panel - Preview */}
                    <section className="panel preview-panel flex flex-col gap-3.5 flex-1 min-h-0 p-4 rounded-[1.25rem] bg-card/60 border border-border/30 backdrop-blur-md overflow-hidden">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[0.68rem] font-extrabold tracking-[0.16em] uppercase text-primary">
                                    Live Preview
                                </p>
                                <h2 className="text-lg font-extrabold tracking-tight">
                                    Current lyric
                                </h2>
                            </div>
                            <div className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-full bg-secondary/40 border border-border/20 text-xs font-bold text-muted-foreground">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                Live
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col gap-3.5 p-4.5 rounded-2xl bg-card/40 border border-border/20 overflow-hidden">
                            <div className="flex flex-col gap-1.5">
                                <span className="text-muted-foreground text-[0.7rem] font-bold uppercase tracking-wider">
                                    Previous
                                </span>
                                <p className="text-muted-foreground text-sm line-clamp-2">
                                    {status?.previous_text || "-"}
                                </p>
                            </div>

                            <div className="flex-1 flex flex-col justify-center gap-4.5 text-center">
                                <span className="inline-flex items-center justify-center self-center h-[34px] px-3 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/15">
                                    On screen
                                </span>
                                <p className="text-foreground text-2xl font-extrabold tracking-tight line-clamp-6 max-w-[620px] mx-auto leading-tight">
                                    {status?.text || "Waiting for backend"}
                                </p>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <span className="text-muted-foreground text-[0.7rem] font-bold uppercase tracking-wider">
                                    Next
                                </span>
                                <p className="text-muted-foreground text-sm line-clamp-2">
                                    {status?.next_text || "No upcoming hymns"}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2.5 pt-1">
                            {[
                                {
                                    label: "Current hymn",
                                    value: status?.current_hymn || "-",
                                },
                                {
                                    label: "Line",
                                    value: status?.total_lines
                                        ? `${status.line_index + 1}/${status.total_lines}`
                                        : "0/0",
                                },
                                {
                                    label: "Overlays",
                                    value: String(
                                        status?.connected_clients || 0
                                    ),
                                },
                                {
                                    label: "Visibility",
                                    value: status?.visible ? "Shown" : "Blank",
                                },
                            ].map((meta) => (
                                <div
                                    key={meta.label}
                                    className="flex flex-col gap-1"
                                >
                                    <span className="text-muted-foreground text-[0.7rem]">
                                        {meta.label}
                                    </span>
                                    <strong className="text-sm font-bold text-foreground">
                                        {meta.value}
                                    </strong>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Right Panel - Overlays & Styling */}
                    <aside className="panel utility-panel flex flex-col gap-3 w-[318px] min-h-0 overflow-hidden">
                        <section className="flex-1 flex flex-col p-3 rounded-[1.25rem] bg-card/60 border border-border/30 backdrop-blur-md overflow-hidden">
                            <div className="mb-2">
                                <p className="text-[0.68rem] font-extrabold tracking-[0.16em] uppercase text-primary">
                                    Overlays
                                </p>
                                <h3 className="text-base font-extrabold tracking-tight">
                                    Browser sources
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
                                {runtime?.overlayUrls?.map((o) => (
                                    <div
                                        key={o.name}
                                        className="p-3 rounded-xl bg-card/50 border border-border/20 space-y-2"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <strong className="text-sm font-bold">
                                                {o.name}
                                            </strong>
                                            <span className="text-xs text-muted-foreground">
                                                {o.path}
                                            </span>
                                        </div>
                                        <code className="block p-2 rounded-xl bg-muted text-xs break-all">
                                            {o.url}
                                        </code>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={async () => {
                                                    await window.desktopApi.copyText(
                                                        o.url
                                                    );
                                                    showToast("URL copied.");
                                                }}
                                                className="flex-1 h-9 rounded-xl bg-secondary text-secondary-foreground text-xs font-medium border border-border/20 hover:bg-secondary/80 transition-colors"
                                            >
                                                Copy
                                            </button>
                                            <button
                                                onClick={() =>
                                                    window.desktopApi.openExternal(
                                                        o.url
                                                    )
                                                }
                                                className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-medium border border-primary/15 hover:bg-primary/90 transition-colors"
                                            >
                                                Open
                                            </button>
                                        </div>
                                    </div>
                                )) || (
                                    <p className="text-muted-foreground text-sm">
                                        Waiting for runtime details...
                                    </p>
                                )}
                            </div>
                        </section>

                        <section className="flex-1 flex flex-col p-3 rounded-[1.25rem] bg-card/60 border border-border/30 backdrop-blur-md overflow-hidden">
                            <div className="mb-2">
                                <p className="text-[0.68rem] font-extrabold tracking-[0.16em] uppercase text-primary">
                                    Theme
                                </p>
                                <h3 className="text-base font-extrabold tracking-tight">
                                    Live styling
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                                <div className="grid grid-cols-2 gap-2.5">
                                    <label className="flex flex-col gap-1.5">
                                        <span className="text-xs font-bold text-muted-foreground">
                                            Template
                                        </span>
                                        <select
                                            ref={speakerTemplateRef}
                                            onChange={queueStyleUpdate}
                                            className="h-10 px-3 rounded-xl bg-background border border-border/20 text-sm outline-none focus:border-ring"
                                        >
                                            <option value="">Custom</option>
                                            <option value="Sabbath School">
                                                Sabbath School
                                            </option>
                                            <option value="Divine Service">
                                                Divine Service
                                            </option>
                                            <option value="Opening Hymn">
                                                Opening Hymn
                                            </option>
                                            <option value="Closing Hymn">
                                                Closing Hymn
                                            </option>
                                            <option value="Scripture Reading">
                                                Scripture Reading
                                            </option>
                                            <option value="Children's Story">
                                                Children&apos;s Story
                                            </option>
                                            <option value="Special Music">
                                                Special Music
                                            </option>
                                        </select>
                                    </label>

                                    <label className="flex flex-col gap-1.5">
                                        <span className="text-xs font-bold text-muted-foreground">
                                            Font size
                                        </span>
                                        <select
                                            ref={fontSizeRef}
                                            onChange={queueStyleUpdate}
                                            defaultValue="md"
                                            className="h-10 px-3 rounded-xl bg-background border border-border/20 text-sm outline-none focus:border-ring"
                                        >
                                            <option value="sm">Small</option>
                                            <option value="md">Medium</option>
                                            <option value="lg">Large</option>
                                            <option value="xl">XL</option>
                                        </select>
                                    </label>

                                    <label className="flex flex-col gap-1.5">
                                        <span className="text-xs font-bold text-muted-foreground">
                                            Alignment
                                        </span>
                                        <select
                                            ref={alignmentRef}
                                            onChange={queueStyleUpdate}
                                            defaultValue="center"
                                            className="h-10 px-3 rounded-xl bg-background border border-border/20 text-sm outline-none focus:border-ring"
                                        >
                                            <option value="left">Left</option>
                                            <option value="center">
                                                Center
                                            </option>
                                            <option value="right">Right</option>
                                        </select>
                                    </label>

                                    <label className="flex flex-col gap-1.5">
                                        <span className="text-xs font-bold text-muted-foreground">
                                            Animation
                                        </span>
                                        <select
                                            ref={animationRef}
                                            onChange={queueStyleUpdate}
                                            defaultValue="pop"
                                            className="h-10 px-3 rounded-xl bg-background border border-border/20 text-sm outline-none focus:border-ring"
                                        >
                                            <option value="slide">Slide</option>
                                            <option value="fade">Fade</option>
                                            <option value="pop">Pop</option>
                                        </select>
                                    </label>
                                </div>

                                <label className="flex flex-col gap-1.5">
                                    <span className="text-xs font-bold text-muted-foreground">
                                        Speaker label
                                    </span>
                                    <input
                                        ref={speakerRef}
                                        onChange={queueStyleUpdate}
                                        placeholder="Optional label"
                                        className="h-10 px-3.5 rounded-xl bg-background border border-border/20 text-sm outline-none focus:border-ring placeholder:text-muted-foreground/60"
                                    />
                                </label>

                                <label className="flex flex-col gap-1.5">
                                    <span className="text-xs font-bold text-muted-foreground">
                                        Safe margin
                                    </span>
                                    <input
                                        ref={safeMarginRef}
                                        type="range"
                                        min="40"
                                        max="160"
                                        defaultValue="80"
                                        onChange={queueStyleUpdate}
                                        className="w-full accent-primary"
                                    />
                                </label>

                                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-border/20">
                                    <label className="flex flex-col gap-1.5">
                                        <span className="text-xs font-bold text-muted-foreground">
                                            Preset
                                        </span>
                                        <select
                                            ref={presetSelectRef}
                                            defaultValue=""
                                            className="h-10 px-3 rounded-xl bg-background border border-border/20 text-sm outline-none focus:border-ring"
                                        >
                                            {Object.keys(presets).map(
                                                (name) => (
                                                    <option
                                                        key={name}
                                                        value={name}
                                                    >
                                                        {name}
                                                    </option>
                                                )
                                            )}
                                        </select>
                                    </label>

                                    <label className="flex flex-col gap-1.5">
                                        <span className="text-xs font-bold text-muted-foreground">
                                            Save as
                                        </span>
                                        <input
                                            ref={presetNameRef}
                                            placeholder="Main service"
                                            className="h-10 px-3.5 rounded-xl bg-background border border-border/20 text-sm outline-none focus:border-ring placeholder:text-muted-foreground/60"
                                        />
                                    </label>

                                    <button
                                        onClick={() =>
                                            sendCommand({
                                                cmd: "apply_preset",
                                                name:
                                                    presetSelectRef.current
                                                        ?.value || "",
                                            })
                                        }
                                        className="h-10 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm border border-border/30 hover:bg-secondary/80 transition-colors"
                                    >
                                        Apply
                                    </button>
                                    <button
                                        onClick={() => {
                                            const name =
                                                presetNameRef.current?.value.trim();
                                            if (!name) {
                                                showToast(
                                                    "Preset name is required.",
                                                    "error"
                                                );
                                                return;
                                            }
                                            sendCommand({
                                                cmd: "update_style",
                                                style: buildStylePayload(),
                                            });
                                            sendCommand({
                                                cmd: "save_preset",
                                                name,
                                            });
                                            presetNameRef.current!.value = "";
                                        }}
                                        className="h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm border border-primary/15 hover:bg-primary/90 transition-colors"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        </section>
                    </aside>
                </main>
            </div>

            {/* Toast Region */}
            <div className="fixed right-5 bottom-5 z-[9999] flex flex-col gap-2.5">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`min-w-[220px] max-w-[340px] px-4 py-3 rounded-2xl text-white text-sm font-medium shadow-lg ${
                            t.level === "error"
                                ? "bg-destructive"
                                : t.level === "warning"
                                  ? "bg-amber-600"
                                  : "bg-foreground/90"
                        }`}
                    >
                        {t.msg}
                    </div>
                ))}
            </div>

            {/* Modal */}
            {modal && (
                <div
                    className="fixed inset-0 z-[120] flex items-center justify-center p-7 bg-foreground/20 backdrop-blur-sm"
                    onClick={() => setModal(null)}
                >
                    <section
                        className="w-full max-w-[760px] max-h-[620px] flex flex-col gap-3.5 p-4.5 rounded-3xl bg-card border border-border/30 shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[0.68rem] font-extrabold tracking-[0.16em] uppercase text-primary">
                                    {modal.eyebrow}
                                </p>
                                <h2 className="text-xl font-extrabold tracking-tight mt-1">
                                    {modal.title}
                                </h2>
                            </div>
                            <button
                                onClick={() => setModal(null)}
                                className="w-[34px] h-[34px] rounded-full bg-secondary text-secondary-foreground flex items-center justify-center border border-border/40 hover:bg-secondary/80 transition-colors"
                                aria-label="Close panel"
                            >
                                <span className="block w-2.5 h-2.5 relative">
                                    <span className="absolute top-1/2 left-0 w-full h-0.5 rounded-full bg-current rotate-45" />
                                    <span className="absolute top-1/2 left-0 w-full h-0.5 rounded-full bg-current -rotate-45" />
                                </span>
                            </button>
                        </div>
                        <div
                            className="flex-1 overflow-auto pr-1"
                            dangerouslySetInnerHTML={{ __html: modal.body }}
                        />
                    </section>
                </div>
            )}

            {/* Search Modal */}
            {searchModalOpen && (
                <div
                    className="fixed inset-0 z-[130] flex items-start justify-center pt-[15vh] p-4 bg-foreground/30 backdrop-blur-sm"
                    onClick={() => setSearchModalOpen(false)}
                >
                    <div
                        className="w-full max-w-[500px] flex flex-col gap-3 p-4 rounded-3xl bg-card border border-border/30 shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Search Header */}
                        <div className="flex items-center gap-2">
                            <div className="flex-1 relative">
                                <input
                                    ref={searchInputRef}
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder="Search by number or title..."
                                    className="w-full h-11 pl-4 pr-12 rounded-xl bg-background border border-border/20 text-sm outline-none focus:border-ring placeholder:text-muted-foreground/60"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    {results.length > 0 && `${results.length}`}
                                </span>
                            </div>
                            <button
                                onClick={() => {
                                    setQuery("");
                                    setSearchModalOpen(false);
                                }}
                                className="shrink-0 w-11 h-11 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center border border-border/40 hover:bg-secondary/80 transition-colors"
                                aria-label="Close search"
                            >
                                <span className="block w-2.5 h-2.5 relative">
                                    <span className="absolute top-1/2 left-0 w-full h-0.5 rounded-full bg-current rotate-45" />
                                    <span className="absolute top-1/2 left-0 w-full h-0.5 rounded-full bg-current -rotate-45" />
                                </span>
                            </button>
                        </div>

                        {/* Results */}
                        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                            {results.length > 0 ? (
                                results.map((h) => (
                                    <button
                                        key={h.number}
                                        onClick={() => handleSearchAndLoad(h)}
                                        className="flex items-center gap-3 p-2.5 rounded-xl bg-card/80 border border-border/20 text-left hover:bg-primary/5 hover:border-primary/20 transition-colors"
                                    >
                                        <span className="inline-flex items-center justify-center min-h-8 px-2.5 rounded-full bg-primary/10 text-primary text-sm font-extrabold shrink-0">
                                            #{h.number}
                                        </span>
                                        <div className="min-w-0">
                                            <span className="block text-sm font-bold text-foreground truncate">
                                                {getHymnTitle(h)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                Hymn {h.number}
                                            </span>
                                        </div>
                                    </button>
                                ))
                            ) : query ? (
                                <div className="py-8 text-center text-muted-foreground text-sm">
                                    No hymns found for &ldquo;{query}&rdquo;
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
