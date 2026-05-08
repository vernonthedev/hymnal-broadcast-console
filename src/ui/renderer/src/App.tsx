import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import ReactMarkdown from "react-markdown";
import {
    Search01Icon,
    BrowserIcon,
    ArrowLeft01Icon,
    ArrowRight01Icon,
    RefreshIcon,
    SquareArrowDownLeftIcon,
    PlayIcon,
    Forward01Icon,
    Backward01Icon,
    Setting07Icon,
    FolderLibraryIcon,
    HelpCircleIcon,
    InformationCircleIcon,
    MinusSignCircleIcon,
    Cancel01Icon,
    WifiConnected01Icon,
    WifiDisconnected01Icon,
    SquareIcon,
    Copy01Icon,
    Sun01Icon,
    Moon01Icon,
    File01Icon,
    Home01Icon,
} from "@hugeicons/core-free-icons";

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

/* ─── Helpers ─── */
function normalizeText(v: unknown) {
    return String(v || "")
        .trim()
        .toLowerCase();
}
function getHymnTitle(item: Hymn) {
    const preview = String(item?.preview || "").trim();
    if (!preview) return "Untitled hymn";
    const firstLine = preview.split(/\r?\n/)[0].trim();
    const firstSegment = firstLine.split(/[-|:]/)[0].trim();
    return firstSegment || firstLine;
}

export default function App() {
    const [runtime, setRuntime] = useState<Runtime | null>(null);
    const [status, setStatus] = useState<Status | null>(null);
    const [hymnIndex, setHymnIndex] = useState<Hymn[]>([]);
    const [presets, setPresets] = useState<Record<string, unknown>>({});
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Hymn[]>([]);
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [selectedHymn, setSelectedHymn] = useState<Hymn | null>(null);
    const [toasts, setToasts] = useState<
        { id: number; msg: string; level: string }[]
    >([]);
    const [modal, setModal] = useState<{
        eyebrow: string;
        title: string;
        body: string;
    } | null>(null);
    const [compactMode, setCompactMode] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [currentView, setCurrentView] = useState<
        "main" | "settings" | "presets"
    >("main");
    const [theme, setTheme] = useState<"dark" | "light">("dark");
    const [showChangelog, setShowChangelog] = useState(false);
    const [changelogContent, setChangelogContent] = useState<string>("");
    const [changelogLoading, setChangelogLoading] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const runtimeRef = useRef<Runtime | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const isConnectingRef = useRef(false);
    const headerRef = useRef<HTMLElement>(null);
    const speakerRef = useRef<HTMLInputElement>(null);
    const fontSizeRef = useRef<HTMLSelectElement>(null);
    const alignmentRef = useRef<HTMLSelectElement>(null);
    const animationRef = useRef<HTMLSelectElement>(null);
    const safeMarginRef = useRef<HTMLInputElement>(null);
    const speakerTemplateRef = useRef<HTMLSelectElement>(null);
    const presetSelectRef = useRef<HTMLSelectElement>(null);
    const presetNameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        runtimeRef.current = runtime;
    }, [runtime]);

    /* ─── Window Dragging ─── */
    useEffect(() => {
        const header = headerRef.current;
        if (!header) return;

        let isDragging = false;
        let startX = 0;
        let startY = 0;

        const onMouseDown = (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest("button")) return;
            isDragging = true;
            startX = e.screenX;
            startY = e.screenY;
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.screenX - startX;
            const dy = e.screenY - startY;
            (window as any).desktopApi.moveWindow(dx, dy);
            startX = e.screenX;
            startY = e.screenY;
        };

        const onMouseUp = () => {
            isDragging = false;
        };

        header.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);

        return () => {
            header.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

    /* ─── Theme Management ─── */
    useEffect(() => {
        const root = document.documentElement;
        if (theme === "dark") {
            root.classList.add("dark");
            root.classList.remove("light");
        } else {
            root.classList.add("light");
            root.classList.remove("dark");
        }
    }, [theme]);

    /* ─── Fetch Changelog from GitHub ─── */
    const fetchChangelog = async () => {
        if (changelogContent) return;
        setChangelogLoading(true);
        try {
            const response = await fetch(
                "https://raw.githubusercontent.com/vernonthedev/hymnal-browser-plugin/main/CHANGELOG.md"
            );
            if (response.ok) {
                const content = await response.text();
                setChangelogContent(content);
            }
        } catch (error) {
            console.error("Failed to fetch changelog:", error);
        } finally {
            setChangelogLoading(false);
        }
    };

    /* ─── Init ─── */
    useEffect(() => {
        init();
    }, []);

    async function init() {
        const rt = await (window as any).desktopApi.getRuntime();
        if (rt) {
            setRuntime(rt);
            connectSocket(rt);
            refreshIndexes(rt);
        }
        (window as any).desktopApi.onBackendEvent((event: any) => {
            if (event.type === "runtime") {
                setRuntime(event.runtime);
                connectSocket(event.runtime);
                refreshIndexes(event.runtime);
            }
            if (event.type === "status") setStatus(event.status);
            if (event.type === "toast")
                showToast(event.message, event.level || "info");
        });
    }

    async function fetchJson(rt: Runtime, route: string) {
        const res = await fetch(`http://127.0.0.1:${rt.httpPort}${route}`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
    }

    async function refreshIndexes(rt: Runtime) {
        const r = (await fetchJson(rt, "/hymns")) as any;
        setHymnIndex(r.items || []);
        const p = (await fetchJson(rt, "/presets")) as any;
        setPresets(p.items || {});
    }

    function connectSocket(rt: Runtime) {
        if (socketRef.current || isConnectingRef.current) return;
        isConnectingRef.current = true;
        const ws = new WebSocket(`ws://127.0.0.1:${rt.wsPort}`);
        socketRef.current = ws;
        ws.addEventListener("open", () =>
            ws.send(
                JSON.stringify({
                    cmd: "hello",
                    role: "control",
                    token: rt.token,
                })
            )
        );
        ws.addEventListener("message", (ev) => {
            const p = JSON.parse(ev.data);
            if (p.type === "status") setStatus(p.status);
            if (p.type === "state") setStatus(p);
            if (p.type === "hymn_index") setHymnIndex(p.items || []);
            if (p.type === "presets") setPresets(p.items || {});
        });
        ws.addEventListener("close", () => {
            socketRef.current = null;
            isConnectingRef.current = false;
            setTimeout(
                () => runtimeRef.current && connectSocket(runtimeRef.current),
                1200
            );
        });
        ws.addEventListener("error", () => {
            isConnectingRef.current = false;
        });
    }

    function sendCommand(payload: Record<string, unknown>) {
        const ws = socketRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            showToast("Backend socket not ready.", "error");
            return;
        }
        ws.send(JSON.stringify(payload));
    }

    /* ─── Finder ─── */
    useEffect(() => {
        const norm = normalizeText(query);
        if (!norm) {
            setResults(hymnIndex.slice(0, 10));
            return;
        }
        const f = hymnIndex
            .filter(
                (i) =>
                    normalizeText(i.number).startsWith(norm) ||
                    normalizeText(i.preview).includes(norm)
            )
            .slice(0, 10);
        setResults(f);
    }, [query, hymnIndex]);

    function selectHymn(number: string) {
        setQuery(number);
        const found = hymnIndex.find((h) => h.number === number) || null;
        setSelectedHymn(found);
    }

    function handleSearchAndLoad(h: Hymn) {
        selectHymn(h.number);
        sendCommand({ cmd: "load", hymn: h.number });
        setSearchModalOpen(false);
    }

    /* ─── Toasts ─── */
    function showToast(msg: string, level = "info") {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, msg, level }]);
        setTimeout(
            () => setToasts((prev) => prev.filter((t) => t.id !== id)),
            3500
        );
    }

    /* ─── Style helpers ─── */
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
        setTimeout(
            () =>
                sendCommand({
                    cmd: "update_style",
                    style: buildStylePayload(),
                }),
            180
        );
    }

    /* ─── Keyboard ─── */
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (searchModalOpen) {
                if (e.key === "Escape") setSearchModalOpen(false);
                return;
            }
            if (
                (e.target as any)?.tagName === "INPUT" ||
                (e.target as any)?.tagName === "SELECT"
            )
                return;
            if (e.key === "ArrowRight" || e.key === " ") {
                e.preventDefault();
                sendCommand({ cmd: "next" });
                return;
            }
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                sendCommand({ cmd: "prev" });
                return;
            }
            if (e.key.toLowerCase() === "r") {
                sendCommand({ cmd: "reset" });
                return;
            }
            if (e.key.toLowerCase() === "b") {
                sendCommand({ cmd: "blank" });
                return;
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [searchModalOpen]);

    return (
        <div className="flex h-screen w-screen overflow-hidden text-foreground bg-background">
            {/* Sidebar */}
            <aside className="w-64 border-r border-border flex flex-col bg-card shrink-0">
                {/* Sidebar Header */}
                <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                    <img
                        src="/assets/logo-transparent.png"
                        alt="SDA Hymnal Logo"
                        className="w-9 h-9 rounded object-contain"
                    />
                    <div>
                        <h1 className="text-sm font-bold leading-tight">
                            Hymnal
                        </h1>
                        <p className="text-[0.7rem] text-muted-foreground">
                            Broadcast Console
                        </p>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
                    <SidebarButton
                        icon={
                            <HugeiconsIcon
                                icon={Home01Icon}
                                size={18}
                                strokeWidth={1.5}
                            />
                        }
                        label="Home"
                        onClick={() => setCurrentView("main")}
                        active={currentView === "main"}
                    />
                    <SidebarButton
                        icon={
                            <HugeiconsIcon
                                icon={Search01Icon}
                                size={18}
                                strokeWidth={1.5}
                            />
                        }
                        label="Search Hymns"
                        onClick={() => setSearchModalOpen(true)}
                        active={searchModalOpen}
                    />
                    <SidebarButton
                        icon={
                            <HugeiconsIcon
                                icon={BrowserIcon}
                                size={18}
                                strokeWidth={1.5}
                            />
                        }
                        label="Browser Sources"
                        onClick={() => {}}
                        active={false}
                    />
                    <SidebarButton
                        icon={
                            <HugeiconsIcon
                                icon={Setting07Icon}
                                size={18}
                                strokeWidth={1.5}
                            />
                        }
                        label="Presets"
                        onClick={() => setCurrentView("presets")}
                        active={currentView === "presets"}
                    />
                    <SidebarButton
                        icon={
                            <HugeiconsIcon
                                icon={Setting07Icon}
                                size={18}
                                strokeWidth={1.5}
                            />
                        }
                        label="Settings"
                        onClick={() => setCurrentView("settings")}
                        active={currentView === "settings"}
                    />

                    {/* Transport Section */}
                    <div className="pt-4 pb-1 px-5">
                        <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
                            Transport
                        </span>
                    </div>
                    <div className="px-3 grid grid-cols-2 gap-1.5">
                        {[
                            {
                                cmd: "prev",
                                label: "Previous",
                                icon: (
                                    <HugeiconsIcon
                                        icon={ArrowLeft01Icon}
                                        size={14}
                                        strokeWidth={2}
                                    />
                                ),
                            },
                            {
                                cmd: "next",
                                label: "Next",
                                icon: (
                                    <HugeiconsIcon
                                        icon={ArrowRight01Icon}
                                        size={14}
                                        strokeWidth={2}
                                    />
                                ),
                            },
                            {
                                cmd: "reset",
                                label: "Reset",
                                icon: (
                                    <HugeiconsIcon
                                        icon={RefreshIcon}
                                        size={14}
                                        strokeWidth={2}
                                    />
                                ),
                            },
                            {
                                cmd: "blank",
                                label: "Blank",
                                icon: (
                                    <HugeiconsIcon
                                        icon={SquareArrowDownLeftIcon}
                                        size={14}
                                        strokeWidth={2}
                                    />
                                ),
                            },
                        ].map(({ cmd, label, icon }) => (
                            <button
                                key={cmd}
                                onClick={() => sendCommand({ cmd })}
                                className="h-8 px-2 rounded-full border border-border bg-secondary hover:bg-secondary/80 transition flex items-center justify-center gap-1.5"
                            >
                                {icon}
                                <span className="text-xs font-semibold">
                                    {label}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Quick Load Section */}
                    <div className="pt-4 pb-1 px-5 mt-2 border-t border-border">
                        <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
                            Quick Load
                        </span>
                    </div>
                    <div className="px-2 space-y-0.5">
                        <SidebarQuickAction
                            icon={
                                <HugeiconsIcon
                                    icon={RefreshIcon}
                                    size={14}
                                    strokeWidth={1.5}
                                />
                            }
                            label="Reload Hymns"
                            onClick={() => sendCommand({ cmd: "reload_hymns" })}
                        />
                        <SidebarQuickAction
                            icon={
                                <HugeiconsIcon
                                    icon={FolderLibraryIcon}
                                    size={14}
                                    strokeWidth={1.5}
                                />
                            }
                            label="Hymns Folder"
                            onClick={async () => {
                                if (runtime?.hymnsDir)
                                    await (window as any).desktopApi.openPath(
                                        runtime.hymnsDir
                                    );
                            }}
                        />
                        <SidebarQuickAction
                            icon={
                                <HugeiconsIcon
                                    icon={HelpCircleIcon}
                                    size={14}
                                    strokeWidth={1.5}
                                />
                            }
                            label="Help"
                            onClick={() =>
                                setModal({
                                    eyebrow: "Help",
                                    title: "Using the console",
                                    body: buildHelpModal,
                                })
                            }
                        />
                        <SidebarQuickAction
                            icon={
                                <HugeiconsIcon
                                    icon={InformationCircleIcon}
                                    size={14}
                                    strokeWidth={1.5}
                                />
                            }
                            label="About"
                            onClick={() =>
                                setModal({
                                    eyebrow: "About",
                                    title: "Hymnal BroadCast Console",
                                    body: buildAboutModal(),
                                })
                            }
                        />
                    </div>
                </nav>

                {/* Sidebar Footer */}
                <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground flex items-center gap-2">
                    <HugeiconsIcon
                        icon={
                            status?.connected_clients !== undefined
                                ? WifiConnected01Icon
                                : WifiDisconnected01Icon
                        }
                        size={14}
                        strokeWidth={1.5}
                    />
                    <span>{status ? "Connected" : "Waiting..."}</span>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Top bar */}
                <header
                    ref={headerRef}
                    className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0 bg-card"
                >
                    <div className="flex items-center gap-3"></div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCompactMode(!compactMode)}
                            className="h-8 px-3 rounded-full border border-border text-xs font-semibold text-muted-foreground hover:bg-secondary/50 transition"
                            title="Toggle Compact Mode"
                        >
                            {compactMode ? "Expand" : "Compact"}
                        </button>
                        <WindowButton
                            onClick={() =>
                                (window as any).desktopApi.minimizeWindow()
                            }
                            icon={
                                <HugeiconsIcon
                                    icon={MinusSignCircleIcon}
                                    size={16}
                                    strokeWidth={1.5}
                                />
                            }
                        />
                        <WindowButton
                            onClick={() =>
                                (
                                    window as any
                                ).desktopApi.toggleMaximizeWindow()
                            }
                            icon={
                                <HugeiconsIcon
                                    icon={isMaximized ? Copy01Icon : SquareIcon}
                                    size={16}
                                    strokeWidth={1.5}
                                />
                            }
                        />
                        <WindowButton
                            onClick={() =>
                                (window as any).desktopApi.closeWindow()
                            }
                            icon={
                                <HugeiconsIcon
                                    icon={Cancel01Icon}
                                    size={16}
                                    strokeWidth={1.5}
                                />
                            }
                            danger
                        />
                    </div>
                </header>

                {/* Workspace */}
                {currentView === "main" ? (
                    <div
                        className={`flex-1 flex overflow-hidden ${compactMode ? "p-2 gap-2" : "p-4 gap-4"}`}
                    >
                        {/* Left: Controls */}
                        <section
                            className={`${compactMode ? "w-56" : "w-72"} flex flex-col gap-3 overflow-y-auto pr-1 shrink-0`}
                        >
                            <div className="space-y-0.5">
                                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                                    Hymn Controls
                                </p>
                                <h2 className="text-base font-bold">
                                    Transport
                                </h2>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                {[
                                    {
                                        k: "Enter",
                                        l: "Load",
                                        icon: (
                                            <HugeiconsIcon
                                                icon={PlayIcon}
                                                size={12}
                                                strokeWidth={2}
                                            />
                                        ),
                                    },
                                    {
                                        k: "Space",
                                        l: "Next",
                                        icon: (
                                            <HugeiconsIcon
                                                icon={Forward01Icon}
                                                size={12}
                                                strokeWidth={2}
                                            />
                                        ),
                                    },
                                    {
                                        k: "Left",
                                        l: "Prev",
                                        icon: (
                                            <HugeiconsIcon
                                                icon={Backward01Icon}
                                                size={12}
                                                strokeWidth={2}
                                            />
                                        ),
                                    },
                                    {
                                        k: "R",
                                        l: "Reset",
                                        icon: (
                                            <HugeiconsIcon
                                                icon={RefreshIcon}
                                                size={12}
                                                strokeWidth={2}
                                            />
                                        ),
                                    },
                                ].map((s) => (
                                    <div
                                        key={s.k}
                                        className="flex items-center justify-between p-1.5 rounded-lg border border-border bg-card"
                                    >
                                        <kbd className="min-w-[40px] px-2 py-1 rounded-full bg-secondary border border-border text-[0.7rem] font-bold text-center flex items-center justify-center gap-1">
                                            {s.icon}
                                            {s.k}
                                        </kbd>
                                        <span className="text-xs text-muted-foreground font-medium">
                                            {s.l}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="p-3 rounded-lg border border-border bg-card space-y-1">
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Selection
                                </p>
                                <p className="text-sm font-semibold">
                                    {selectedHymn
                                        ? `Hymn ${selectedHymn.number}`
                                        : "No hymn selected"}
                                </p>
                                <p className="text-xs text-muted-foreground leading-snug">
                                    {selectedHymn
                                        ? getHymnTitle(selectedHymn)
                                        : "Use Search to find a hymn."}
                                </p>
                            </div>
                            <div className="mt-auto grid grid-cols-2 gap-1.5 pt-2 border-t border-border">
                                {[
                                    {
                                        c: "prev",
                                        label: "Previous",
                                        icon: (
                                            <HugeiconsIcon
                                                icon={ArrowLeft01Icon}
                                                size={14}
                                                strokeWidth={2}
                                            />
                                        ),
                                    },
                                    {
                                        c: "next",
                                        label: "Next",
                                        icon: (
                                            <HugeiconsIcon
                                                icon={ArrowRight01Icon}
                                                size={14}
                                                strokeWidth={2}
                                            />
                                        ),
                                    },
                                    {
                                        c: "show",
                                        label: "Show",
                                        icon: (
                                            <HugeiconsIcon
                                                icon={PlayIcon}
                                                size={14}
                                                strokeWidth={2}
                                            />
                                        ),
                                    },
                                    {
                                        c: "blank",
                                        label: "Blank",
                                        icon: (
                                            <HugeiconsIcon
                                                icon={SquareArrowDownLeftIcon}
                                                size={14}
                                                strokeWidth={2}
                                            />
                                        ),
                                    },
                                ].map(({ c, label, icon }) => (
                                    <button
                                        key={c}
                                        onClick={() => sendCommand({ cmd: c })}
                                        className={`h-9 rounded-full border text-xs font-semibold transition flex items-center justify-center gap-1.5 ${c === "next" ? "bg-primary text-primary-foreground border-primary/15 hover:bg-primary/90" : "bg-secondary border-border hover:bg-secondary/80"}`}
                                    >
                                        {icon}
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Center: Preview */}
                        <section className="flex-1 min-w-0 border border-border rounded-lg bg-card flex flex-col gap-3 overflow-hidden">
                            <div
                                className={`${compactMode ? "px-2 pt-2 pb-1" : "px-4 pt-4 pb-2"} flex items-center justify-between shrink-0`}
                            >
                                <div>
                                    <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                                        Live Preview
                                    </p>
                                    <h2
                                        className={`${compactMode ? "text-sm" : "text-base"} font-bold`}
                                    >
                                        Current Lyric
                                    </h2>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />{" "}
                                    Live
                                </div>
                            </div>
                            <div
                                className={`flex-1 border-t border-border flex flex-col ${compactMode ? "p-2" : "p-4"} gap-3 overflow-hidden`}
                            >
                                <div>
                                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                                        Previous
                                    </p>
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                        {status?.previous_text || "—"}
                                    </p>
                                </div>
                                <div className="flex-1 flex flex-col justify-center gap-2 text-center min-h-0">
                                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                                        On Screen
                                    </p>
                                    <p className="text-xl font-extrabold tracking-tight line-clamp-6 max-w-[600px] mx-auto leading-tight">
                                        {status?.text || "Waiting for backend"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                                        Next
                                    </p>
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                        {status?.next_text ||
                                            "No upcoming hymns"}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-3 px-4 pt-2 pb-4 border-t border-border shrink-0">
                                {[
                                    {
                                        l: "Hymn",
                                        v: status?.current_hymn || "—",
                                    },
                                    {
                                        l: "Line",
                                        v: status?.total_lines
                                            ? `${status.line_index + 1}/${status.total_lines}`
                                            : "0/0",
                                    },
                                    {
                                        l: "Overlays",
                                        v: String(
                                            status?.connected_clients || 0
                                        ),
                                    },
                                    {
                                        l: "Status",
                                        v: status?.visible ? "Shown" : "Blank",
                                    },
                                ].map((m) => (
                                    <div
                                        key={m.l}
                                        className="flex flex-col gap-0.5"
                                    >
                                        <span className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                                            {m.l}
                                        </span>
                                        <strong className="text-sm font-bold">
                                            {m.v}
                                        </strong>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Right: Styling */}
                        <aside
                            className={`${compactMode ? "w-48" : "w-64"} shrink-0 overflow-y-auto pr-1 flex flex-col gap-3`}
                        >
                            <div className="space-y-0.5">
                                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                                    Theme
                                </p>
                                <h2
                                    className={`${compactMode ? "text-sm" : "text-base"} font-bold`}
                                >
                                    Live Styling
                                </h2>
                            </div>
                            <section
                                className={`border border-border rounded-lg bg-card ${compactMode ? "p-2" : "p-3"} space-y-2.5`}
                            >
                                <Label>Template</Label>
                                <select
                                    ref={speakerTemplateRef}
                                    onChange={queueStyleUpdate}
                                    className="h-9 w-full px-2 rounded-lg border border-border bg-background text-sm outline-none"
                                >
                                    <option value="">Custom</option>
                                    <option>Sabbath School</option>
                                    <option>Divine Service</option>
                                    <option>Opening Hymn</option>
                                    <option>Closing Hymn</option>
                                    <option>Scripture Reading</option>
                                    <option>Special Music</option>
                                </select>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label>Font size</Label>
                                        <select
                                            ref={fontSizeRef}
                                            onChange={queueStyleUpdate}
                                            defaultValue="md"
                                            className="h-9 w-full px-2 rounded-lg border border-border bg-background text-sm outline-none"
                                        >
                                            <option>sm</option>
                                            <option>md</option>
                                            <option>lg</option>
                                            <option>xl</option>
                                        </select>
                                    </div>
                                    <div>
                                        <Label>Alignment</Label>
                                        <select
                                            ref={alignmentRef}
                                            onChange={queueStyleUpdate}
                                            defaultValue="center"
                                            className="h-9 w-full px-2 rounded-lg border border-border bg-background text-sm outline-none"
                                        >
                                            <option>left</option>
                                            <option>center</option>
                                            <option>right</option>
                                        </select>
                                    </div>
                                    <div>
                                        <Label>Animation</Label>
                                        <select
                                            ref={animationRef}
                                            onChange={queueStyleUpdate}
                                            defaultValue="pop"
                                            className="h-9 w-full px-2 rounded-lg border border-border bg-background text-sm outline-none"
                                        >
                                            <option>slide</option>
                                            <option>fade</option>
                                            <option>pop</option>
                                        </select>
                                    </div>
                                    <div>
                                        <Label>Safe Margin</Label>
                                        <input
                                            ref={safeMarginRef}
                                            type="range"
                                            min="40"
                                            max="160"
                                            defaultValue="80"
                                            onChange={queueStyleUpdate}
                                            className="w-full accent-primary mt-2"
                                        />
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-border">
                                    <Label>Speaker Label</Label>
                                    <input
                                        ref={speakerRef}
                                        onChange={queueStyleUpdate}
                                        placeholder="Optional text..."
                                        className="h-9 w-full px-2.5 rounded-lg border border-border bg-background text-sm outline-none placeholder:text-muted-foreground/60"
                                    />
                                </div>
                            </section>
                            <section
                                className={`border border-border rounded-lg bg-card ${compactMode ? "p-2" : "p-3"} space-y-2.5`}
                            >
                                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                                    Presets
                                </p>
                                <div className="flex gap-2">
                                    <select
                                        ref={presetSelectRef}
                                        defaultValue=""
                                        className="h-9 flex-1 px-2 rounded-lg border border-border bg-background text-sm outline-none"
                                    >
                                        {Object.keys(presets).map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() =>
                                            sendCommand({
                                                cmd: "apply_preset",
                                                name:
                                                    presetSelectRef.current
                                                        ?.value || "",
                                            })
                                        }
                                        className="h-9 px-3 rounded-lg bg-secondary border border-border hover:bg-secondary/80 text-xs font-semibold"
                                    >
                                        Apply
                                    </button>
                                </div>
                                <input
                                    ref={presetNameRef}
                                    placeholder="Preset name..."
                                    className="h-9 w-full px-2.5 rounded-lg border border-border bg-background text-sm outline-none placeholder:text-muted-foreground/60"
                                />
                                <button
                                    onClick={() => {
                                        const n =
                                            presetNameRef.current?.value.trim();
                                        if (!n) {
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
                                            name: n,
                                        });
                                        presetNameRef.current!.value = "";
                                    }}
                                    className="h-9 w-full rounded-full bg-primary text-primary-foreground text-xs font-semibold border border-primary/15 hover:bg-primary/90"
                                >
                                    Save Preset
                                </button>
                            </section>
                        </aside>
                    </div>
                ) : currentView === "presets" ? (
                    <div
                        className={`flex-1 flex overflow-hidden ${compactMode ? "p-2 gap-2" : "p-4 gap-4"}`}
                    >
                        <section className="flex-1 flex flex-col gap-4 overflow-y-auto">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                                        Presets
                                    </p>
                                    <h2 className="text-base font-bold">
                                        Style Presets
                                    </h2>
                                </div>
                                <button
                                    onClick={() => setCurrentView("main")}
                                    className="h-9 px-4 rounded-full border border-border bg-secondary hover:bg-secondary/80 transition text-xs font-semibold flex items-center gap-2"
                                >
                                    <HugeiconsIcon
                                        icon={ArrowLeft01Icon}
                                        size={14}
                                        strokeWidth={1.5}
                                    />
                                    Back to Home
                                </button>
                            </div>

                            <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    Presets allow you to save and load different
                                    style configurations for your hymn overlays.
                                </p>
                                <div className="grid grid-cols-1 gap-2">
                                    {Object.keys(presets).length > 0 ? (
                                        Object.keys(presets).map(
                                            (presetName) => (
                                                <button
                                                    key={presetName}
                                                    onClick={() => {
                                                        const preset = presets[
                                                            presetName
                                                        ] as Record<
                                                            string,
                                                            unknown
                                                        >;
                                                        sendCommand({
                                                            cmd: "update_style",
                                                            style: preset,
                                                        });
                                                        showToast(
                                                            `Loaded preset: ${presetName}`,
                                                            "success"
                                                        );
                                                    }}
                                                    className="p-3 rounded-lg border border-border bg-secondary hover:bg-secondary/80 transition text-left"
                                                >
                                                    <p className="text-sm font-semibold">
                                                        {presetName}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Click to load
                                                    </p>
                                                </button>
                                            )
                                        )
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-4">
                                            No presets saved yet. Create one
                                            from the main controls.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                ) : currentView === "settings" ? (
                    <div
                        className={`flex-1 flex overflow-hidden ${compactMode ? "p-2 gap-2" : "p-4 gap-4"}`}
                    >
                        <section className="flex-1 flex flex-col gap-4 overflow-y-auto">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                                        Settings
                                    </p>
                                    <h2 className="text-base font-bold">
                                        Preferences
                                    </h2>
                                </div>
                                <button
                                    onClick={() => setCurrentView("main")}
                                    className="h-9 px-4 rounded-full border border-border bg-secondary hover:bg-secondary/80 transition text-xs font-semibold flex items-center gap-2"
                                >
                                    <HugeiconsIcon
                                        icon={ArrowLeft01Icon}
                                        size={14}
                                        strokeWidth={1.5}
                                    />
                                    Back to Home
                                </button>
                            </div>

                            {/* Theme Toggle */}
                            <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <HugeiconsIcon
                                            icon={
                                                theme === "dark"
                                                    ? Moon01Icon
                                                    : Sun01Icon
                                            }
                                            size={20}
                                            strokeWidth={1.5}
                                            className="text-muted-foreground"
                                        />
                                        <div>
                                            <p className="text-sm font-semibold">
                                                Theme
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Switch between dark and light
                                                mode
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() =>
                                            setTheme(
                                                theme === "dark"
                                                    ? "light"
                                                    : "dark"
                                            )
                                        }
                                        className="h-9 px-4 rounded-lg border border-border bg-secondary hover:bg-secondary/80 transition text-xs font-semibold flex items-center gap-2"
                                    >
                                        <HugeiconsIcon
                                            icon={
                                                theme === "dark"
                                                    ? Sun01Icon
                                                    : Moon01Icon
                                            }
                                            size={14}
                                            strokeWidth={1.5}
                                        />
                                        {theme === "dark" ? "Light" : "Dark"}
                                    </button>
                                </div>
                            </div>

                            {/* Changelog */}
                            <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <HugeiconsIcon
                                            icon={File01Icon}
                                            size={20}
                                            strokeWidth={1.5}
                                            className="text-muted-foreground"
                                        />
                                        <div>
                                            <p className="text-sm font-semibold">
                                                Changelog
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                View recent changes and updates
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowChangelog(true);
                                            fetchChangelog();
                                        }}
                                        className="h-9 px-4 rounded-lg border border-border bg-secondary hover:bg-secondary/80 transition text-xs font-semibold"
                                    >
                                        View
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>
                ) : null}
            </main>

            {/* Toasts */}
            <div className="fixed inset-x-0 bottom-5 z-[9999] flex justify-center pointer-events-none gap-2">
                <div className="flex flex-col gap-2">
                    {toasts.map((t) => (
                        <div
                            key={t.id}
                            className={`px-4 py-2.5 rounded-lg text-sm font-medium pointer-events-auto ${t.level === "error" ? "bg-destructive text-white" : t.level === "warning" ? "bg-amber-600 text-white" : "bg-foreground/90 text-white"}`}
                        >
                            {t.msg}
                        </div>
                    ))}
                </div>
            </div>

            {/* Search Modal */}
            {searchModalOpen && (
                <div
                    className="fixed inset-0 z-[130] flex items-start justify-center pt-[15vh] p-4 bg-background/60 backdrop-blur-sm"
                    onClick={() => setSearchModalOpen(false)}
                >
                    <div
                        className="w-full max-w-md flex flex-col gap-3 p-4 rounded-lg border border-border bg-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2">
                            <input
                                ref={searchInputRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                autoComplete="off"
                                placeholder="Search by number or title..."
                                className="flex-1 h-10 pl-3 pr-4 rounded-lg border border-border bg-background text-sm outline-none focus:border-ring placeholder:text-muted-foreground/60"
                            />
                            <button
                                onClick={() => {
                                    setQuery("");
                                    setSearchModalOpen(false);
                                }}
                                className="h-10 w-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary/50"
                            >
                                <HugeiconsIcon
                                    icon={Cancel01Icon}
                                    size={16}
                                    strokeWidth={1.5}
                                />
                            </button>
                        </div>
                        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto pr-1">
                            {results.map((h) => (
                                <button
                                    key={h.number}
                                    onClick={() => handleSearchAndLoad(h)}
                                    className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-left hover:bg-secondary/40 transition"
                                >
                                    <span className="inline-flex items-center justify-center min-h-7 px-2 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                                        #{h.number}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold truncate">
                                            {getHymnTitle(h)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Hymn {h.number}
                                        </p>
                                    </div>
                                </button>
                            ))}
                            {results.length === 0 && query && (
                                <p className="py-8 text-center text-muted-foreground text-sm">
                                    No hymns found for &ldquo;{query}&rdquo;
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Changelog Modal */}
            {showChangelog && (
                <div
                    className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm"
                    onClick={() => setShowChangelog(false)}
                >
                    <div
                        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-lg border border-border bg-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                            <div>
                                <p className="text-sm font-semibold text-muted-foreground">
                                    About
                                </p>
                                <h3 className="text-lg font-bold">Changelog</h3>
                            </div>
                            <button
                                onClick={() => setShowChangelog(false)}
                                className="h-8 w-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary/50"
                            >
                                <HugeiconsIcon
                                    icon={Cancel01Icon}
                                    size={16}
                                    strokeWidth={1.5}
                                />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-5">
                            {changelogLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <p className="text-sm text-muted-foreground">
                                        Loading changelog...
                                    </p>
                                </div>
                            ) : changelogContent ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown
                                        components={{
                                            h2: ({ children }) => (
                                                <h3 className="text-lg font-bold mb-3 mt-4">
                                                    {children}
                                                </h3>
                                            ),
                                            h3: ({ children }) => (
                                                <h4 className="text-base font-semibold mb-2 mt-3">
                                                    {children}
                                                </h4>
                                            ),
                                            ul: ({ children }) => (
                                                <ul className="list-disc list-inside space-y-1 ml-4">
                                                    {children}
                                                </ul>
                                            ),
                                            li: ({ children }) => (
                                                <li className="text-muted-foreground">
                                                    {children}
                                                </li>
                                            ),
                                            a: ({ href, children }) => (
                                                <a
                                                    href={href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-primary hover:underline"
                                                >
                                                    {children}
                                                </a>
                                            ),
                                            p: ({ children }) => (
                                                <p className="mb-3">
                                                    {children}
                                                </p>
                                            ),
                                        }}
                                    >
                                        {changelogContent}
                                    </ReactMarkdown>
                                </div>
                            ) : (
                                <div className="text-center text-sm text-muted-foreground">
                                    <p>Failed to load changelog.</p>
                                    <p className="mt-2">
                                        <a
                                            href="https://github.com/vernonthedev/hymnal-browser-plugin/blob/main/CHANGELOG.md"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline"
                                        >
                                            View on GitHub
                                        </a>
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal */}
            {modal && (
                <div
                    className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-background/50"
                    onClick={() => setModal(null)}
                >
                    <section
                        className="w-full max-w-2xl flex flex-col gap-4 p-5 rounded-lg border border-border bg-card max-h-[85vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between">
                            <div>
                                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                                    {modal.eyebrow}
                                </p>
                                <h2 className="text-lg font-bold mt-0.5">
                                    {modal.title}
                                </h2>
                            </div>
                            <button
                                onClick={() => setModal(null)}
                                className="h-8 w-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary/50"
                            >
                                <HugeiconsIcon
                                    icon={Cancel01Icon}
                                    size={16}
                                    strokeWidth={1.5}
                                />
                            </button>
                        </div>
                        <div
                            className="flex-1 overflow-auto pr-1"
                            dangerouslySetInnerHTML={{ __html: modal.body }}
                        />
                    </section>
                </div>
            )}
        </div>
    );
}

function SidebarButton({
    label,
    icon,
    onClick,
    active,
}: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    active: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-left transition ${active ? "bg-primary/10 text-primary border-l-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/40 border-l-2 border-transparent"}`}
        >
            <span className="shrink-0">{icon}</span>
            <span className="truncate">{label}</span>
        </button>
    );
}

function SidebarQuickAction({
    label,
    icon,
    onClick,
}: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground transition text-left"
        >
            <span className="shrink-0 text-muted-foreground/60">{icon}</span>
            {label}
        </button>
    );
}

function WindowButton({
    onClick,
    icon,
    danger,
}: {
    onClick: () => void;
    icon: React.ReactNode;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={`h-8 w-8 flex items-center justify-center rounded-lg border transition ${danger ? "border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10" : "border-border text-muted-foreground hover:bg-secondary/50"}`}
        >
            {icon}
        </button>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return (
        <span className="block text-xs font-bold text-muted-foreground mb-0.5">
            {children}
        </span>
    );
}

const aboutBody = `<div class="space-y-3">
  <p class="text-muted-foreground text-sm">Hymnal BroadCast Console is a local broadcast console for loading hymn lyrics and sending live overlay updates to browser-based outputs.</p>
  <div class="p-3 rounded border border-border bg-card/50"><p class="text-sm font-bold mb-1">Shortcuts</p><p class="text-sm text-muted-foreground">Enter = Load | Space/Right = Next | Left = Previous | R = Reset | B = Blank</p></div>
</div>`;

const buildHelpModal = `<div class="modal-copy">
      <p>Use hymn number search to load lyrics quickly, then control progression with keyboard shortcuts or the transport buttons.</p>
      <div class="modal-list">
        <article class="modal-card">
          <div class="modal-card-header"><strong>Shortcuts</strong><span>Keyboard</span></div>
          <p><kbd>Enter</kbd> Load selected hymn, <kbd>Space</kbd> Next line, <kbd>Left</kbd> Previous line, <kbd>R</kbd> Reset, <kbd>B</kbd> Blank.</p>
        </article>
        <article class="modal-card">
          <div class="modal-card-header"><strong>Overlays</strong><span>OBS / vMix</span></div>
          <p>Copy overlay URLs from the URLs page or the right sidebar and use them as browser sources.</p>
        </article>
        <article class="modal-card">
          <div class="modal-card-header"><strong>Theme Controls</strong><span>Live output</span></div>
          <p>Template, font size, alignment, animation, and safe margin update the live overlay style immediately.</p>
        </article>
        <article class="modal-card">
          <div class="modal-card-header"><strong>Support</strong><span>Links</span></div>
          <p>Developer: vernonthedev</p>
          <code>https://vernon.skope.au</code>
          <code>https://github.com/vernonthedev/hymnal-browser-plugin</code>
        </article>
      </div>
    </div>`;

function buildAboutModal(): string {
    const releaseVersion = state.releaseInfo?.version || "Unavailable";
    const releaseDate = state.releaseInfo?.releasedOn || "Unavailable";
    const releaseSummary = state.releaseInfo?.summary || [];

    return `
    <div class="modal-copy">
      <p>Hymnal BroadCast Console is a local broadcast console for loading hymn lyrics and sending live overlay updates to browser-based outputs.</p>
      <div class="modal-list">
        <article class="modal-card">
          <div class="modal-card-header"><strong>Developer</strong><span>vernonthedev</span></div>
          <p>Website</p>
          <code>https://vernon.skope.au</code>
        </article>
        <article class="modal-card">
          <div class="modal-card-header"><strong>Release Version</strong><span>${escapeHtml(releaseVersion)}</span></div>
          <p>Latest version resolved from CHANGELOG.md.</p>
        </article>
        <article class="modal-card">
          <div class="modal-card-header"><strong>Released On</strong><span>${escapeHtml(releaseDate)}</span></div>
          <p>This value follows your semantic-release changelog updates from CI.</p>
        </article>
        <article class="modal-card">
          <div class="modal-card-header"><strong>Runtime</strong><span>${state.runtime ? "Connected" : "Waiting"}</span></div>
          <p>${state.runtime ? `HTTP ${escapeHtml(String(state.runtime.httpPort))}, WS ${escapeHtml(String(state.runtime.wsPort))}` : "Backend runtime details are not available yet."}</p>
        </article>
        <article class="modal-card">
          <div class="modal-card-header"><strong>Source Code</strong><span>GitHub</span></div>
          <code>https://github.com/vernonthedev/hymnal-browser-plugin</code>
        </article>
        <article class="modal-card">
          <div class="modal-card-header"><strong>Latest Changes</strong><span>${releaseSummary.length}</span></div>
          ${
              releaseSummary.length
                  ? `<ul class="modal-bullets">${releaseSummary.map((item: string) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
                  : "<p>No changelog summary available.</p>"
          }
        </article>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

const state = {
    runtime: null as RuntimeInfo | null,
    status: null as Status | null,
    socket: null as WebSocket | null,
    hymnIndex: [] as Hymn[],
    presets: {} as Record<string, any>,
    appVersion: "0.0.0",
    releaseInfo: null as any,
    reconnectTimer: null as number | null,
    styleUpdateTimer: null as number | null,
    logLines: [] as string[],
    pickerDismissed: false,
    isConnecting: false,
    shouldReconnect: true,
};

interface RuntimeInfo {
    version: string;
    httpPort: number;
    wsPort: number;
    dataDir: string;
    hymnsDir: string;
    token: string;
    overlayProfiles: any[];
    overlayUrls: any[];
}
