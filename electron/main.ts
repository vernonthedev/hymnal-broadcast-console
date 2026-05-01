import { app, BrowserWindow, ipcMain, shell, clipboard, Menu } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import * as crypto from "crypto";
import * as http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_HTTP_PORT = 9999;
const DEFAULT_WS_PORT = 8765;
const HEARTBEAT_INTERVAL_SECONDS = 10;
const HEARTBEAT_TIMEOUT_SECONDS = 30;
const CHANGELOG_FILE = "CHANGELOG.md";
const APP_VERSION = "2.0.0";
const HOST = "127.0.0.1";

interface Style {
    fontSizePreset: string;
    alignment: string;
    safeMargin: number;
    animation: string;
    speakerLabel: string;
}

const DEFAULT_STYLE: Style = {
    fontSizePreset: "md",
    alignment: "center",
    safeMargin: 80,
    animation: "pop",
    speakerLabel: "",
};

const DEFAULT_PRESETS: Record<string, Style> = {
    Default: { ...DEFAULT_STYLE },
    Stage: {
        fontSizePreset: "xl",
        alignment: "center",
        safeMargin: 120,
        animation: "fade",
        speakerLabel: "",
    },
};

interface OverlayProfile {
    id: string;
    name: string;
    path: string;
}

const OVERLAYS: OverlayProfile[] = [
    {
        id: "lowerthird",
        name: "Lower Third",
        path: "/overlays/lowerthird.html",
    },
    { id: "stage", name: "Stage", path: "/overlays/stage.html" },
    { id: "lyrics", name: "Lyrics", path: "/overlays/lyrics.html" },
];

interface OverlayMeta {
    lastPong: number;
    authorized: boolean;
    role: string;
}

interface RuntimeInfo {
    version: string;
    httpPort: number;
    wsPort: number;
    dataDir: string;
    hymnsDir: string;
    token: string;
    overlayProfiles: OverlayProfile[];
    overlayUrls: OverlayUrl[];
}

interface OverlayUrl extends OverlayProfile {
    url: string;
}

interface HymnBroadcastServerState {
    baseDir: string;
    dataDir: string;
    hymnsDir: string;
    presetsPath: string;
    token: string;
    httpPort: number;
    wsPort: number;
    connectedClients: number;
    controlClients: number;
    lastError: string;
    overlayClients: Map<number, OverlayMeta>;
    controlClientIds: Set<number>;
    presets: Record<string, Style>;
    hymnIndex: Hymn[];
    currentHymn: string;
    lines: string[];
    lineIndex: number;
    visible: boolean;
    style: Style;
}

interface Hymn {
    number: string;
    preview: string;
}

interface StatusPayload {
    version: string;
    http_port: number;
    ws_port: number;
    current_hymn: string;
    line_index: number;
    total_lines: number;
    text: string;
    previous_text: string;
    next_text: string;
    visible: boolean;
    connected_clients: number;
    control_clients: number;
    style: Style;
    presets: Record<string, Style>;
    overlay_profiles: OverlayProfile[];
    last_error: string;
    token_enabled: boolean;
}

let mainWindow: BrowserWindow | null = null;
let hymnBroadcastServer: HymnBroadcastServer | null = null;
let runtimeInfo: RuntimeInfo | null = null;

// Backend Server Implementation
class HymnBroadcastServer {
    state: HymnBroadcastServerState;
    wss: WebSocketServer | null;
    httpServer: http.Server | null;
    heartbeatInterval: NodeJS.Timeout | null;

    constructor(baseDir: string, dataDir: string, token: string) {
        this.state = this.initializeState(baseDir, dataDir, token);
        this.wss = null;
        this.httpServer = null;
        this.heartbeatInterval = null;
    }

    initializeState(
        baseDir: string,
        dataDir: string,
        token: string
    ): HymnBroadcastServerState {
        const hymnsDir = fs.existsSync(path.join(dataDir, "hymns"))
            ? path.join(dataDir, "hymns")
            : path.join(baseDir, "hymns");
        const presetsPath = path.join(dataDir, "style-presets.json");

        return {
            baseDir,
            dataDir,
            hymnsDir,
            presetsPath,
            token,
            httpPort: 0,
            wsPort: 0,
            connectedClients: 0,
            controlClients: 0,
            lastError: "",
            overlayClients: new Map(),
            controlClientIds: new Set(),
            presets: {},
            hymnIndex: [],
            currentHymn: "1",
            lines: [],
            lineIndex: 0,
            visible: true,
            style: { ...DEFAULT_STYLE },
        };
    }

    async initialize(): Promise<void> {
        console.log("Hymns are initializing...");
        await ensureDirectory(this.state.dataDir);
        this.state.presets = await this.loadPresets(this.state.presetsPath);
        this.state.hymnIndex = await this.buildHymnIndex(this.state.hymnsDir);
        this.state.lines = await this.readHymnLines(
            this.state.currentHymn,
            this.state.hymnsDir
        );
        console.log("Hymns are initialized.");
    }

    async loadPresets(presetsPath: string): Promise<Record<string, Style>> {
        if (!fs.existsSync(presetsPath)) {
            const presets = { ...DEFAULT_PRESETS };
            await this.savePresets(presetsPath, presets);
            return presets;
        }

        try {
            const data = JSON.parse(
                await fs.promises.readFile(presetsPath, "utf-8")
            );
            if (typeof data === "object" && data !== null) {
                return data as Record<string, Style>;
            }
        } catch (error) {
            console.error(`Error loading presets from ${presetsPath}:`, error);
        }

        const presets = { ...DEFAULT_PRESETS };
        await this.savePresets(presetsPath, presets);
        return presets;
    }

    async savePresets(
        presetsPath: string,
        presets: Record<string, Style>
    ): Promise<void> {
        try {
            await fs.promises.writeFile(
                presetsPath,
                JSON.stringify(presets, null, 2)
            );
        } catch (error) {
            console.error(`Error saving presets to ${presetsPath}:`, error);
        }
    }

    async readHymnLines(hymn: string, hymnsDir: string): Promise<string[]> {
        const filePath = path.join(hymnsDir, `${hymn}.txt`);
        try {
            if (!fs.existsSync(filePath)) return [];

            console.log("Reading Hymn line contents");
            const content = await fs.promises.readFile(filePath, "utf-8");
            return content
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0);
        } catch (error) {
            console.error(`Error reading hymn ${hymn}:`, error);
            return [];
        }
    }

    sortHymnPath(path: string): [number, string] {
        const stem = path.replace(/\.txt$/, "");
        const num = parseInt(stem);
        return isNaN(num) ? [Number.MAX_SAFE_INTEGER, stem] : [num, stem];
    }

    async buildHymnIndex(hymnsDir: string): Promise<Hymn[]> {
        if (!fs.existsSync(hymnsDir)) return [];
        try {
            const files = await fs.promises.readdir(hymnsDir);
            const hymnFiles = files
                .filter((file) => file.endsWith(".txt"))
                .sort((a, b) => {
                    const [aNum] = this.sortHymnPath(a);
                    const [bNum] = this.sortHymnPath(b);
                    return aNum - bNum;
                });

            const index = await Promise.all(
                hymnFiles.map(async (file): Promise<Hymn> => {
                    const number = file.replace(/\.txt$/, "");
                    let preview = "";
                    try {
                        const content = await fs.promises.readFile(
                            path.join(hymnsDir, file),
                            "utf-8"
                        );
                        const firstLine = content.split(/\r?\n/)[0]?.trim();
                        if (firstLine) preview = firstLine;
                    } catch (err) {
                        console.error(`Error reading hymn file ${file}:`, err);
                    }
                    return { number, preview };
                })
            );
            console.log(`Indexed ${index.length} hymns.`);
            return index;
        } catch (error) {
            console.error("Error building hymn index:", error);
            return [];
        }
    }

    getStatusPayload(): StatusPayload {
        return {
            version: APP_VERSION,
            http_port: this.state.httpPort,
            ws_port: this.state.wsPort,
            current_hymn: this.state.currentHymn,
            line_index: this.state.lineIndex,
            total_lines: this.state.lines.length,
            text: this.currentText(),
            previous_text:
                this.state.lineIndex > 0
                    ? this.state.lines[this.state.lineIndex - 1]
                    : "",
            next_text:
                this.state.lineIndex + 1 < this.state.lines.length
                    ? this.state.lines[this.state.lineIndex + 1]
                    : "",
            visible: this.state.visible,
            connected_clients: this.state.connectedClients,
            control_clients: this.state.controlClients,
            style: this.state.style,
            presets: this.state.presets,
            overlay_profiles: OVERLAYS,
            last_error: this.state.lastError,
            token_enabled: !!this.state.token,
        };
    }

    currentText(): string {
        if (
            !this.state.lines ||
            this.state.lineIndex >= this.state.lines.length
        ) {
            return "";
        }
        return this.state.lines[this.state.lineIndex];
    }

    handleWebSocketConnection(ws: WebSocket): void {
        // Mark as overlay client initially
        const clientId = (Math.random() * 1000000) | 0;
        this.state.overlayClients.set(clientId, {
            lastPong: Date.now() / 1000,
            authorized: !this.state.token,
            role: "overlay",
        });

        (ws as any).clientId = clientId;

        // Send hello message
        ws.send(
            JSON.stringify({
                type: "hello",
                requiresAuth: !!this.state.token,
                overlayProfiles: OVERLAYS,
                httpPort: this.state.httpPort,
                wsPort: this.state.wsPort,
            })
        );

        if (!this.state.token) {
            ws.send(JSON.stringify(this.overlayPayload("state")));
        }

        // Handle messages
        ws.on("message", (data) => {
            try {
                const message = data.toString();
                this.handleWebSocketMessage(ws, message);
            } catch (error) {
                console.error("WebSocket message error:", error);
            }
        });

        // Handle close
        ws.on("close", () => {
            this.handleWebSocketClose(ws);
        });
    }

    handleWebSocketMessage(ws: WebSocket, message: string): void {
        try {
            const data = JSON.parse(message);
            const clientId = (ws as any).clientId;

            if (data.cmd === "hello") {
                this.handleHello(ws, data, clientId);
            } else if (data.cmd === "auth") {
                this.handleAuth(ws, data, clientId);
            } else if (data.cmd === "pong") {
                this.handlePong(clientId);
            } else {
                this.handleCommand(ws, data, clientId);
            }
        } catch (error) {
            console.error("WebSocket message error:", error);
        }
    }

    handleHello(ws: WebSocket, data: any, clientId: number): void {
        const role = data.role || "overlay";
        if (role === "control") {
            const providedToken = data.token || "";
            const isAuthorized =
                !this.state.token || providedToken === this.state.token;
            if (!isAuthorized) {
                ws.send(
                    JSON.stringify({
                        type: "error",
                        message: "Control token rejected.",
                    })
                );
                return;
            }
            this.markClientRole(clientId, "control");
            ws.send(
                JSON.stringify({
                    type: "status",
                    status: this.getStatusPayload(),
                })
            );
        } else {
            this.markClientRole(clientId, "overlay");
            ws.send(JSON.stringify(this.overlayPayload("state")));
        }
    }

    handleAuth(ws: WebSocket, data: any, clientId: number): void {
        const overlayMeta = this.state.overlayClients.get(clientId);
        if (!overlayMeta) {
            this.markClientRole(clientId, "overlay");
            return;
        }

        const token = data.token || "";
        overlayMeta.authorized =
            token === this.state.token || !this.state.token;

        if (!overlayMeta.authorized) {
            ws.send(
                JSON.stringify({
                    type: "error",
                    message: "Overlay token rejected.",
                })
            );
            return;
        }

        ws.send(JSON.stringify(this.overlayPayload("state")));
    }

    handlePong(clientId: number): void {
        const overlayMeta = this.state.overlayClients.get(clientId);
        if (overlayMeta) {
            overlayMeta.lastPong = Date.now() / 1000;
        }
    }

    async handleCommand(
        ws: WebSocket,
        data: any,
        clientId: number
    ): Promise<void> {
        // Check authorization for overlay clients
        if (this.state.overlayClients.has(clientId)) {
            const overlayMeta = this.state.overlayClients.get(clientId)!;
            if (this.state.token && !overlayMeta.authorized) {
                ws.send(
                    JSON.stringify({
                        type: "error",
                        message: "Overlay is not authorized.",
                    })
                );
                return;
            }
        }

        const { success, error, payload } = await this.processCommand(data);

        if (!success) {
            ws.send(JSON.stringify({ type: "error", message: error }));
            ws.send(
                JSON.stringify({
                    type: "status",
                    status: this.getStatusPayload(),
                })
            );
            return;
        }

        if (payload) {
            this.broadcast(payload);
            if (payload.type === "hymn_index" || payload.type === "presets") {
                ws.send(JSON.stringify(payload));
            }
        }
    }

    handleWebSocketClose(ws: WebSocket): void {
        const clientId = (ws as any).clientId;
        if (!clientId) return;

        if (this.state.overlayClients.has(clientId)) {
            this.state.overlayClients.delete(clientId);
        }
        if (this.state.controlClientIds.has(clientId)) {
            this.state.controlClientIds.delete(clientId);
        }

        this.updateClientCounts();
        this.broadcast(this.overlayPayload("status"));
    }

    markClientRole(clientId: number, role: string): void {
        this.state.overlayClients.delete(clientId);
        this.state.controlClientIds.delete(clientId);

        if (role === "control") {
            this.state.controlClientIds.add(clientId);
        } else {
            this.state.overlayClients.set(clientId, {
                lastPong: Date.now() / 1000,
                authorized: !this.state.token,
                role: "overlay",
            });
        }

        this.updateClientCounts();
    }

    updateClientCounts(): void {
        this.state.connectedClients = this.state.overlayClients.size;
        this.state.controlClients = this.state.controlClientIds.size;
    }

    async processCommand(
        command: any
    ): Promise<{ success: boolean; error?: string; payload?: any }> {
        const cmd = command.cmd;
        if (!cmd) {
            return { success: false, error: "Missing cmd" };
        }

        switch (cmd) {
            case "load":
                return await this.handleLoadCommand(command);
            case "next":
                return this.handleNextCommand();
            case "prev":
                return this.handlePrevCommand();
            case "reset":
                return this.handleResetCommand();
            case "blank":
                return this.handleBlankCommand();
            case "show":
                return this.handleShowCommand();
            case "retrigger":
            case "ping_overlay":
                return this.handleRetriggerCommand();
            case "update_style":
                return this.handleUpdateStyleCommand(command);
            case "save_preset":
                return await this.handleSavePresetCommand(command);
            case "apply_preset":
                return this.handleApplyPresetCommand(command);
            case "reload_hymns":
                return await this.handleReloadHymnsCommand();
            default:
                this.state.lastError = `Unsupported command: ${cmd}`;
                return { success: false, error: this.state.lastError };
        }
    }

    async handleLoadCommand(
        command: any
    ): Promise<{ success: boolean; error?: string; payload?: any }> {
        const hymn = String(command.hymn || "").trim();
        if (!hymn) {
            this.state.lastError = "Please enter a hymn number.";
            return { success: false, error: this.state.lastError };
        }

        const lines = await this.readHymnLines(hymn, this.state.hymnsDir);
        if (!lines.length) {
            this.state.lastError = `Hymn ${hymn} was not found or is empty.`;
            return { success: false, error: this.state.lastError };
        }

        this.state.currentHymn = hymn;
        this.state.lines = lines;
        this.state.lineIndex = 0;
        this.state.visible = true;
        this.state.lastError = "";
        return { success: true, payload: this.overlayPayload("state") };
    }

    handleNextCommand(): { success: boolean; payload: any } {
        if (this.state.lineIndex < this.state.lines.length - 1) {
            this.state.lineIndex++;
        }
        this.state.lastError = "";
        return { success: true, payload: this.overlayPayload("state") };
    }

    handlePrevCommand(): { success: boolean; payload: any } {
        if (this.state.lineIndex > 0) {
            this.state.lineIndex--;
        }
        this.state.lastError = "";
        return { success: true, payload: this.overlayPayload("state") };
    }

    handleResetCommand(): { success: boolean; payload: any } {
        this.state.lineIndex = 0;
        this.state.visible = true;
        this.state.lastError = "";
        return { success: true, payload: this.overlayPayload("state") };
    }

    handleBlankCommand(): { success: boolean; payload: any } {
        this.state.visible = false;
        this.state.lastError = "";
        return { success: true, payload: this.overlayPayload("visibility") };
    }

    handleShowCommand(): { success: boolean; payload: any } {
        this.state.visible = true;
        this.state.lastError = "";
        return { success: true, payload: this.overlayPayload("visibility") };
    }

    handleRetriggerCommand(): { success: boolean; payload: any } {
        this.state.lastError = "";
        return { success: true, payload: this.overlayPayload("retrigger") };
    }

    handleUpdateStyleCommand(command: any): {
        success: boolean;
        error?: string;
        payload?: any;
    } {
        const style = command.style;
        if (typeof style !== "object" || !style) {
            this.state.lastError = "Style payload must be an object.";
            return { success: false, error: this.state.lastError };
        }

        this.state.style = { ...this.state.style, ...style };
        this.state.lastError = "";
        return { success: true, payload: this.overlayPayload("style") };
    }

    async handleSavePresetCommand(
        command: any
    ): Promise<{ success: boolean; error?: string; payload?: any }> {
        const name = String(command.name || "").trim();
        if (!name) {
            this.state.lastError = "Please enter a preset name.";
            return { success: false, error: this.state.lastError };
        }

        this.state.presets[name] = { ...this.state.style };
        await this.savePresets(this.state.presetsPath, this.state.presets);
        this.state.lastError = "";
        return {
            success: true,
            payload: { type: "presets", items: this.state.presets },
        };
    }

    handleApplyPresetCommand(command: any): {
        success: boolean;
        error?: string;
        payload?: any;
    } {
        const name = String(command.name || "").trim();
        const preset = this.state.presets[name];
        if (!preset) {
            this.state.lastError = `Preset ${name} was not found.`;
            return { success: false, error: this.state.lastError };
        }

        this.state.style = { ...preset };
        this.state.lastError = "";
        return { success: true, payload: this.overlayPayload("style") };
    }

    async handleReloadHymnsCommand(): Promise<{
        success: boolean;
        payload: any;
    }> {
        this.state.hymnIndex = await this.buildHymnIndex(this.state.hymnsDir);
        this.state.lastError = "";
        return {
            success: true,
            payload: { type: "hymn_index", items: this.state.hymnIndex },
        };
    }

    overlayPayload(event: string = "state"): any {
        return {
            type: event,
            httpPort: this.state.httpPort,
            wsPort: this.state.wsPort,
            hymn: this.state.currentHymn,
            lineIndex: this.state.lineIndex,
            totalLines: this.state.lines.length,
            text: this.currentText(),
            visible: this.state.visible,
            style: this.state.style,
            connectedClients: this.state.connectedClients,
            controlClients: this.state.controlClients,
            error: this.state.lastError,
        };
    }

    broadcast(payload: any): void {
        if (!this.wss) return;

        const message = JSON.stringify(payload);
        const isOverlayEvent = [
            "state",
            "visibility",
            "retrigger",
            "style",
        ].includes(payload.type);

        const targets = Array.from(this.wss.clients).filter((ws) => {
            const clientId = (ws as any).clientId;
            if (!clientId) return false;

            // Control clients receive everything
            if (this.state.controlClientIds.has(clientId)) return true;

            // Overlay clients receive overlay events if authorized
            const overlayMeta = this.state.overlayClients.get(clientId);
            if (isOverlayEvent && overlayMeta) {
                return !this.state.token || overlayMeta.authorized;
            }

            // Default to true for other event types (like 'status' or 'hymn_index')
            return !isOverlayEvent;
        });

        console.log(
            `Broadcasting ${payload.type} to ${targets.length} clients`
        );
        targets.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now() / 1000;

            this.wss!.clients.forEach((ws) => {
                const clientId = (ws as any).clientId;
                const overlayMeta = this.state.overlayClients.get(clientId);
                if (!overlayMeta) return;

                if (now - overlayMeta.lastPong > HEARTBEAT_TIMEOUT_SECONDS) {
                    ws.terminate();
                    return;
                }

                if (this.state.token && !overlayMeta.authorized) return;

                ws.send(
                    JSON.stringify({ type: "heartbeat", ts: Math.floor(now) })
                );
            });
        }, HEARTBEAT_INTERVAL_SECONDS * 1000);
    }

    handleHttpRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): void {
        const url = new URL(req.url!, `http://${req.headers.host}`);
        const method = req.method;
        const reqPath = url.pathname;

        console.log(`[HTTP] ${method} ${reqPath}`);

        // Add CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization"
        );

        if (method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        try {
            switch (reqPath) {
                case "/health":
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(
                        JSON.stringify({
                            ok: fs.existsSync(this.state.hymnsDir),
                            http_port: this.state.httpPort,
                            ws_port: this.state.wsPort,
                        })
                    );
                    break;

                case "/status":
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(this.getStatusPayload()));
                    break;

                case "/version":
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ version: APP_VERSION }));
                    break;

                case "/hymns":
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ items: this.state.hymnIndex }));
                    break;

                case "/presets":
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ items: this.state.presets }));
                    break;

                default:
                    // Serve static files
                    (async () => {
                        try {
                            let targetPath = path.join(
                                this.state.baseDir,
                                reqPath
                            );

                            let realBase: string;
                            let realTarget: string;
                            try {
                                realBase = fs.realpathSync(this.state.baseDir);
                                realTarget = fs.realpathSync(targetPath);
                            } catch {
                                res.writeHead(404, {
                                    "Content-Type": "text/plain",
                                });
                                res.end("Not Found");
                                return;
                            }

                            if (
                                !realTarget.startsWith(realBase + path.sep) &&
                                realTarget !== realBase
                            ) {
                                res.writeHead(404, {
                                    "Content-Type": "text/plain",
                                });
                                res.end("Not Found");
                                return;
                            }

                            const stats = await fs.promises.stat(realTarget);
                            if (stats.isDirectory()) {
                                const indexPath = path.join(
                                    targetPath,
                                    "index.html"
                                );
                                if (fs.existsSync(indexPath)) {
                                    targetPath = indexPath;
                                    realTarget = fs.realpathSync(targetPath);
                                } else {
                                    res.writeHead(403, {
                                        "Content-Type": "text/plain",
                                    });
                                    res.end("Directory listing not allowed");
                                    return;
                                }
                            }

                            const content =
                                await fs.promises.readFile(realTarget);
                            const ext = path.extname(realTarget).toLowerCase();
                            const contentType =
                                ext === ".html"
                                    ? "text/html"
                                    : ext === ".css"
                                      ? "text/css"
                                      : ext === ".js"
                                        ? "application/javascript"
                                        : ext === ".png"
                                          ? "image/png"
                                          : ext === ".jpg" || ext === ".jpeg"
                                            ? "image/jpeg"
                                            : "application/octet-stream";
                            res.writeHead(200, { "Content-Type": contentType });
                            res.end(content);
                        } catch (err) {
                            console.error(
                                `Error serving file ${reqPath}:`,
                                err
                            );
                            if (!res.writableEnded) {
                                res.writeHead(500, {
                                    "Content-Type": "application/json",
                                });
                                res.end(
                                    JSON.stringify({
                                        error: "Internal Server Error",
                                    })
                                );
                            }
                        }
                    })();
                    break;
            }
        } catch (error) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    async start(httpPort: number, wsPort: number): Promise<void> {
        await this.initialize();
        this.state.httpPort = httpPort;
        this.state.wsPort = wsPort;

        // Create HTTP server
        this.httpServer = http.createServer((req, res) => {
            this.handleHttpRequest(req, res);
        });

        // Create WebSocket server
        this.wss = new WebSocketServer({
            port: wsPort,
            host: HOST,
            perMessageDeflate: false,
        });

        this.wss.on("error", (error) => {
            console.error("WebSocket server error:", error);
        });

        // Handle WebSocket connections
        this.wss.on("connection", (ws) => {
            this.handleWebSocketConnection(ws);
        });

        return new Promise((resolve) => {
            this.httpServer!.listen(httpPort, HOST, () => {
                console.log(
                    `HTTP server listening on http://${HOST}:${httpPort}`
                );
                console.log(`WebSocket server ready on ws://${HOST}:${wsPort}`);
                this.startHeartbeat();
                resolve();
            });
        });
    }

    stop(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        if (this.wss) {
            this.wss.close();
        }
        if (this.httpServer) {
            this.httpServer.close();
        }
    }
}

function sendToRenderer(channel: string, payload: any): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

function getRepoReadablePath(relativePath: string): string {
    if (app.isPackaged) {
        const resourcePath = path.join(process.resourcesPath, relativePath);
        if (fs.existsSync(resourcePath)) {
            return resourcePath;
        }
        return path.join(
            process.resourcesPath,
            "app.asar.unpacked",
            relativePath
        );
    }
    return path.join(app.getAppPath(), relativePath);
}

async function getLatestReleaseInfo(): Promise<{
    version: string;
    releasedOn: string | null;
    summary: string[];
    source: string;
}> {
    const fallbackVersion = app.getVersion();
    const changelogPath = getRepoReadablePath(CHANGELOG_FILE);

    if (!fs.existsSync(changelogPath)) {
        return {
            version: fallbackVersion,
            releasedOn: null,
            summary: [],
            source: "app",
        };
    }

    try {
        const changelog = await fs.promises.readFile(changelogPath, "utf8");
        const lines = changelog.split(/\r?\n/);
        const headerIndex = lines.findIndex((line) =>
            /^#\s*\[?\d+\.\d+\.\d+\]?/.test(line)
        );

        if (headerIndex === -1) {
            return {
                version: fallbackVersion,
                releasedOn: null,
                summary: [],
                source: "app",
            };
        }

        const header = lines[headerIndex];
        const versionMatch = header.match(/(\d+\.\d+\.\d+)/);
        const dateMatch = header.match(/\((\d{4}-\d{2}-\d{2})\)/);
        const nextHeaderIndex = lines.findIndex(
            (line, index) =>
                index > headerIndex && /^#\s*\[?\d+\.\d+\.\d+\]?/.test(line)
        );
        const sectionLines = lines.slice(
            headerIndex + 1,
            nextHeaderIndex === -1 ? lines.length : nextHeaderIndex
        );
        const summary = sectionLines
            .filter((line) => line.trim().startsWith("* "))
            .slice(0, 6)
            .map((line) =>
                line
                    .replace(/^\*\s*/, "")
                    .replace(/\s*\(\[?.*$/, "")
                    .trim()
            );

        return {
            version: versionMatch ? versionMatch[1] : fallbackVersion,
            releasedOn: dateMatch ? dateMatch[1] : null,
            summary,
            source: "changelog",
        };
    } catch {
        return {
            version: fallbackVersion,
            releasedOn: null,
            summary: [],
            source: "app",
        };
    }
}

function getAppDataRoot(): string {
    return path.join(app.getPath("appData"), "SDA Hymnal Desktop");
}

async function ensureDirectory(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
}

async function seedHymnsDir(targetHymnsDir: string): Promise<void> {
    await ensureDirectory(targetHymnsDir);
    const sourceDir = app.isPackaged
        ? getRepoReadablePath("hymns")
        : path.join(app.getAppPath(), "hymns");

    if (!fs.existsSync(sourceDir)) {
        return;
    }

    const targetFiles = await fs.promises.readdir(targetHymnsDir);
    const hasFiles = targetFiles.some((entry) => entry.endsWith(".txt"));
    if (hasFiles) {
        return;
    }

    const sourceFiles = await fs.promises.readdir(sourceDir);
    for (const fileName of sourceFiles) {
        if (!fileName.endsWith(".txt")) {
            continue;
        }
        await fs.promises.copyFile(
            path.join(sourceDir, fileName),
            path.join(targetHymnsDir, fileName)
        );
    }
}

async function loadOrCreateRuntimeConfig(): Promise<{ token: string }> {
    const root = getAppDataRoot();
    await ensureDirectory(root);
    const configPath = path.join(root, "runtime.json");
    let config: { token?: string } = {};

    if (fs.existsSync(configPath)) {
        try {
            config = JSON.parse(await fs.promises.readFile(configPath, "utf8"));
        } catch {
            config = {};
        }
    }

    if (!config.token) {
        config.token = crypto.randomBytes(18).toString("hex");
    }

    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
    return config as { token: string };
}

function checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => {
            server.close(() => resolve(true));
        });
        server.listen(port, "127.0.0.1");
    });
}

async function choosePort(preferredPort: number): Promise<number> {
    if (await checkPort(preferredPort)) {
        return preferredPort;
    }

    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port =
                typeof address === "object" && address
                    ? address.port
                    : preferredPort;
            server.close(() => resolve(port));
        });
    });
}

// Backend is now integrated directly into main process

function overlayUrlsFromRuntime(info: RuntimeInfo): OverlayUrl[] {
    return info.overlayProfiles.map((overlay) => ({
        ...overlay,
        url: `http://127.0.0.1:${info.httpPort}${overlay.path}?token=${encodeURIComponent(info.token)}&wsPort=${info.wsPort}`,
    }));
}

// Backend is now integrated, no health check needed

function monitorBackendOutput(
    stream: NodeJS.ReadableStream,
    onLine: (line: string) => void
): void {
    let buffer = "";
    stream.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
            if (line.trim()) {
                onLine(line);
            }
        }
    });
}

async function startBackend(): Promise<void> {
    if (hymnBroadcastServer) {
        return;
    }

    try {
        const config = await loadOrCreateRuntimeConfig();
        const appDataRoot = getAppDataRoot();
        const dataDir = path.join(appDataRoot, "data");
        const hymnsDir = path.join(dataDir, "hymns");
        await ensureDirectory(dataDir);
        await seedHymnsDir(hymnsDir);

        const httpPort = await choosePort(DEFAULT_HTTP_PORT);
        const wsPort = await choosePort(DEFAULT_WS_PORT);
        const baseDir = app.isPackaged
            ? process.resourcesPath
            : app.getAppPath();

        sendToRenderer("backend-event", {
            type: "lifecycle",
            phase: "starting",
            message: "Server starting",
        });

        hymnBroadcastServer = new HymnBroadcastServer(
            baseDir,
            dataDir,
            config.token
        );
        await hymnBroadcastServer.start(httpPort, wsPort);

        runtimeInfo = {
            version: APP_VERSION,
            httpPort: httpPort,
            wsPort: wsPort,
            dataDir: dataDir,
            hymnsDir: hymnsDir,
            token: config.token,
            overlayProfiles: OVERLAYS,
            overlayUrls: [],
        };
        runtimeInfo.overlayUrls = overlayUrlsFromRuntime(runtimeInfo);

        sendToRenderer("backend-event", {
            type: "runtime",
            runtime: runtimeInfo,
        });
        sendToRenderer("backend-event", {
            type: "lifecycle",
            phase: "running",
            message: "Server running",
        });
    } catch (error) {
        console.error("Failed to start backend:", error);
        sendToRenderer("backend-event", {
            type: "toast",
            level: "error",
            message: `Failed to start backend: ${(error as Error).message}`,
        });
    }
}

function stopBackend(): void {
    if (hymnBroadcastServer) {
        hymnBroadcastServer.stop();
        hymnBroadcastServer = null;
    }
    runtimeInfo = null;
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1180,
        height: 760,
        minWidth: 1180,
        minHeight: 760,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        frame: false,
        titleBarStyle: "hidden",
        backgroundColor: "#0a0c10",
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.webContents.on(
        "did-fail-load",
        (_event, errorCode, errorDescription) => {
            console.error(
                `[Main] Window failed to load: ${errorCode} ${errorDescription}`
            );
        }
    );

    mainWindow.webContents.on("dom-ready", () => {});

    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

// Disable GPU acceleration to prevent crashes in headless environments
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("--disable-gpu");
app.commandLine.appendSwitch("--disable-software-rasterizer");

app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);

    ipcMain.handle("runtime:get", async () => {
        return runtimeInfo;
    });
    ipcMain.handle("clipboard:copy", async (_event, text) => {
        clipboard.writeText(text);
        return true;
    });
    ipcMain.handle("shell:openExternal", async (_event, target) => {
        await shell.openExternal(target);
        return true;
    });
    ipcMain.handle("shell:openPath", async (_event, target) => {
        await shell.openPath(target);
        return true;
    });
    ipcMain.handle("app:getVersion", async () => app.getVersion());
    ipcMain.handle(
        "app:getReleaseInfo",
        async () => await getLatestReleaseInfo()
    );
    ipcMain.handle("window:minimize", async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.minimize();
        }
        return true;
    });
    ipcMain.handle("window:close", async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.close();
        }
        return true;
    });

    createWindow();
    await startBackend();
});

app.on("before-quit", async (event) => {
    event.preventDefault();
    stopBackend();
    app.exit(0);
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
