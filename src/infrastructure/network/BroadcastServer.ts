import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { WebSocketServer, WebSocket } from "ws";
import {
    Style,
    DEFAULT_STYLE,
    OverlayMeta,
    DEFAULT_OVERLAYS,
    ServerConfig,
    Hymn,
} from "../../types";
import { HymnIndexService } from "../../domain/services/HymnIndex";
import { StyleManagerService } from "../../domain/services/StyleManager";
import { BroadcastCommandHandler } from "../../application/commands/BroadcastCommandHandler";
import { BroadcastStatusUseCase } from "../../application/usecases/BroadcastStatusUseCase";

const HEARTBEAT_INTERVAL_SECONDS = 10;
const HEARTBEAT_TIMEOUT_SECONDS = 30;
const HOST = "127.0.0.1";

export class BroadcastServer {
    private config: ServerConfig;
    private httpServer: http.Server | null = null;
    private wss: WebSocketServer | null = null;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    private hymnIndexService = new HymnIndexService();
    private styleManagerService = new StyleManagerService();
    private commandHandler = new BroadcastCommandHandler();
    private statusUseCase: BroadcastStatusUseCase;

    private overlayClients = new Map<number, OverlayMeta>();
    private controlClientIds = new Set<number>();
    private currentHymn = "1";
    private lines: string[] = [];
    private lineIndex = 0;
    private visible = true;
    private presets: Record<string, Style> = {};
    private hymnIndex: { number: string; preview: string }[] = [];

    constructor(
        baseDir: string,
        dataDir: string,
        token: string,
        version: string
    ) {
        this.config = {
            baseDir,
            dataDir,
            hymnsDir: path.join(dataDir, "hymns"),
            presetsPath: path.join(dataDir, "style-presets.json"),
            token,
            httpPort: 0,
            wsPort: 0,
        };
        this.statusUseCase = new BroadcastStatusUseCase(version, token);
    }

    async initialize(): Promise<void> {
        console.log("Hymns are initializing...");
        await fs.promises.mkdir(this.config.dataDir, { recursive: true });

        this.presets = (await this.styleManagerService.loadPresets(
            this.config.presetsPath
        )) as Record<string, Style>;
        this.hymnIndex = await this.hymnIndexService.buildIndex(
            this.config.hymnsDir
        );
        this.lines = await this.hymnIndexService.readLines(
            this.currentHymn,
            this.config.hymnsDir
        );

        this.statusUseCase.setPresets(this.presets);
        this.statusUseCase.setHymnState(
            this.currentHymn,
            this.lines,
            this.lineIndex,
            this.visible
        );
        this.statusUseCase.setHymnQueue(
            this.commandHandler.getState().hymnQueue
        );
        this.statusUseCase.setStyle(DEFAULT_STYLE);

        console.log("Hymns are initialized.");
    }

    async start(httpPort: number, wsPort: number): Promise<void> {
        await this.initialize();

        this.config.httpPort = httpPort;
        this.config.wsPort = wsPort;
        this.statusUseCase.setPorts(httpPort, wsPort);

        this.httpServer = http.createServer((req, res) =>
            this.handleHttpRequest(req, res)
        );

        this.wss = new WebSocketServer({
            port: wsPort,
            host: HOST,
            perMessageDeflate: false,
        });
        this.wss.on("connection", (ws) => this.handleWebSocketConnection(ws));

        await new Promise<void>((resolve) => {
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
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.wss?.close();
        this.httpServer?.close();
    }

    private handleHttpRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): void {
        const url = new URL(req.url!, `http://${req.headers.host}`);
        const method = req.method;
        const reqPath = url.pathname;

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
                            ok: true,
                            http_port: this.config.httpPort,
                            ws_port: this.config.wsPort,
                        })
                    );
                    break;
                case "/status":
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(this.statusUseCase.getStatus()));
                    break;
                case "/version":
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ version: "2.0.0" }));
                    break;
                case "/hymns":
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ items: this.hymnIndex }));
                    break;
                case "/presets":
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ items: this.presets }));
                    break;
                default:
                    this.serveStaticFile(req, res, reqPath);
            }
        } catch {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    }

    private async serveStaticFile(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        reqPath: string
    ): Promise<void> {
        try {
            let targetPath = path.join(this.config.baseDir, reqPath);

            // Special handling for overlays in development
            if (
                reqPath.startsWith("/overlays/") &&
                !fs.existsSync(targetPath)
            ) {
                const overlayPath = reqPath.replace("/overlays/", "");
                targetPath = path.join(
                    this.config.baseDir,
                    "src",
                    "ui",
                    "overlays",
                    overlayPath
                );
            }

            let realBase: string;
            let realTarget: string;
            try {
                realBase = fs.realpathSync(this.config.baseDir);
                realTarget = fs.realpathSync(targetPath);
            } catch {
                res.writeHead(404);
                res.end("Not Found");
                return;
            }

            if (
                !realTarget.startsWith(realBase + path.sep) &&
                realTarget !== realBase
            ) {
                res.writeHead(404);
                res.end("Not Found");
                return;
            }

            const stats = await fs.promises.stat(realTarget);
            if (stats.isDirectory()) {
                const indexPath = path.join(targetPath, "index.html");
                if (fs.existsSync(indexPath)) {
                    targetPath = indexPath;
                    realTarget = fs.realpathSync(targetPath);
                } else {
                    res.writeHead(403);
                    res.end("Directory listing not allowed");
                    return;
                }
            }

            const content = await fs.promises.readFile(realTarget);
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
            console.error(`Error serving file ${reqPath}:`, err);
            res.writeHead(404);
            res.end("Not Found");
        }
    }

    private handleWebSocketConnection(ws: WebSocket): void {
        const clientId = Math.floor(Math.random() * 1000000);
        this.overlayClients.set(clientId, {
            lastPong: Date.now() / 1000,
            authorized: !this.config.token,
            role: "overlay",
        });
        (ws as any).clientId = clientId;

        ws.send(
            JSON.stringify({
                type: "hello",
                requiresAuth: !!this.config.token,
                overlayProfiles: DEFAULT_OVERLAYS,
                httpPort: this.config.httpPort,
                wsPort: this.config.wsPort,
            })
        );

        if (!this.config.token) {
            ws.send(
                JSON.stringify(this.statusUseCase.getOverlayPayload("state"))
            );
        }

        ws.on("message", (data) => {
            try {
                const message = data.toString();
                this.handleWebSocketMessage(ws, message);
            } catch (error) {
                console.error("WebSocket message error:", error);
            }
        });

        ws.on("close", () => this.handleWebSocketClose(ws));
    }

    private handleWebSocketMessage(ws: WebSocket, message: string): void {
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

    private handleHello(ws: WebSocket, data: any, clientId: number): void {
        const role = data.role || "overlay";
        if (role === "control") {
            // Control clients (main app) are trusted and don't require token authentication
            // since they run on the same machine
            this.overlayClients.delete(clientId);
            this.controlClientIds.add(clientId);
            ws.send(
                JSON.stringify({
                    type: "status",
                    status: this.statusUseCase.getStatus(),
                })
            );
        } else {
            this.markClientRole(clientId, "overlay");
            ws.send(
                JSON.stringify(this.statusUseCase.getOverlayPayload("state"))
            );
        }
    }

    private handleAuth(ws: WebSocket, data: any, clientId: number): void {
        const overlayMeta = this.overlayClients.get(clientId);
        if (!overlayMeta) {
            this.markClientRole(clientId, "overlay");
            return;
        }

        const token = data.token || "";
        overlayMeta.authorized =
            token === this.config.token || !this.config.token;

        if (!overlayMeta.authorized) {
            ws.send(
                JSON.stringify({
                    type: "error",
                    message: "Overlay token rejected.",
                })
            );
            return;
        }

        ws.send(JSON.stringify(this.statusUseCase.getOverlayPayload("state")));
    }

    private handlePong(clientId: number): void {
        const overlayMeta = this.overlayClients.get(clientId);
        if (overlayMeta) {
            overlayMeta.lastPong = Date.now() / 1000;
        }
    }

    private async handleCommand(
        ws: WebSocket,
        data: any,
        clientId: number
    ): Promise<void> {
        if (this.overlayClients.has(clientId)) {
            const overlayMeta = this.overlayClients.get(clientId)!;
            if (this.config.token && !overlayMeta.authorized) {
                ws.send(
                    JSON.stringify({
                        type: "error",
                        message: "Overlay is not authorized.",
                    })
                );
                return;
            }
        }

        const result = await this.commandHandler.handle(data, async (hymn) => {
            return this.hymnIndexService.readLines(hymn, this.config.hymnsDir);
        });

        this.updateStateFromCommand(result);

        if (!result.success) {
            ws.send(JSON.stringify({ type: "error", message: result.error }));
            // Status is broadcast below
            return;
        }

        if (result.payload) {
            const payload = result.payload as {
                type?: string;
                nextHymn?: string;
            };
            if (payload.type === "state") {
                this.broadcast(this.statusUseCase.getOverlayPayload("state"));
            } else if (payload.type === "visibility") {
                this.broadcast(
                    this.statusUseCase.getOverlayPayload("visibility")
                );
            } else if (payload.type === "style") {
                this.broadcast(this.statusUseCase.getOverlayPayload("style"));
            } else if (payload.type === "retrigger") {
                this.broadcast(
                    this.statusUseCase.getOverlayPayload("retrigger")
                );
            } else if (
                payload.type === "load_next_from_queue" &&
                payload.nextHymn
            ) {
                // Handle loading next hymn from queue
                this.handleLoadNextFromQueue(payload.nextHymn, ws);
            } else if (
                payload.type === "hymn_index" ||
                payload.type === "presets" ||
                payload.type === "hymn_queue_updated"
            ) {
                this.broadcast(result.payload);
                ws.send(JSON.stringify(result.payload));
            }
        }

        // Send status update to control clients
        if (result.success || !result.success) {
            this.broadcast({
                type: "status",
                status: this.statusUseCase.getStatus(),
            });
        }
    }

    private updateStateFromCommand(result: {
        success: boolean;
        payload?: unknown;
        error?: string;
    }): void {
        const state = this.commandHandler.getState();
        this.currentHymn = state.currentHymn;
        this.lines = state.lines;
        this.lineIndex = state.lineIndex;
        this.visible = state.visible;
        this.statusUseCase.setHymnState(
            this.currentHymn,
            this.lines,
            this.lineIndex,
            this.visible
        );
        this.statusUseCase.setStyle(state.style);
        this.statusUseCase.setHymnQueue(state.hymnQueue);

        if (result.error) {
            this.statusUseCase.setLastError(result.error);
        }
    }

    private async handleLoadNextFromQueue(
        nextHymn: string,
        ws: WebSocket
    ): Promise<void> {
        try {
            const lines = await this.hymnIndexService.readLines(
                nextHymn,
                this.config.hymnsDir
            );
            if (!lines.length) {
                ws.send(
                    JSON.stringify({
                        type: "error",
                        message: `Hymn ${nextHymn} was not found or is empty.`,
                    })
                );
                return;
            }

            // Remove the hymn from queue and load it
            this.commandHandler.setState({
                ...this.commandHandler.getState(),
                hymnQueue: this.commandHandler
                    .getState()
                    .hymnQueue.filter((h) => h !== nextHymn),
            });

            this.currentHymn = nextHymn;
            this.lines = lines;
            this.lineIndex = 0;
            this.visible = true;

            this.statusUseCase.setHymnState(
                this.currentHymn,
                this.lines,
                this.lineIndex,
                this.visible
            );
            this.statusUseCase.setHymnQueue(
                this.commandHandler.getState().hymnQueue
            );

            this.broadcast(this.statusUseCase.getOverlayPayload("state"));
            ws.send(
                JSON.stringify({
                    type: "status",
                    status: this.statusUseCase.getStatus(),
                })
            );
        } catch (error) {
            console.error("Error loading next hymn from queue:", error);
            ws.send(
                JSON.stringify({
                    type: "error",
                    message: "Failed to load next hymn from queue.",
                })
            );
        }
    }

    private handleWebSocketClose(ws: WebSocket): void {
        const clientId = (ws as any).clientId;
        if (!clientId) return;

        if (this.overlayClients.has(clientId)) {
            this.overlayClients.delete(clientId);
        }
        if (this.controlClientIds.has(clientId)) {
            this.controlClientIds.delete(clientId);
        }

        this.statusUseCase.setClientCounts(
            this.overlayClients.size,
            this.controlClientIds.size
        );
        this.broadcast(this.statusUseCase.getOverlayPayload("status"));
    }

    private markClientRole(clientId: number, role: string): void {
        this.overlayClients.delete(clientId);
        this.controlClientIds.delete(clientId);

        if (role === "control") {
            this.controlClientIds.add(clientId);
        } else {
            this.overlayClients.set(clientId, {
                lastPong: Date.now() / 1000,
                authorized: !this.config.token,
                role: "overlay",
            });
        }

        this.statusUseCase.setClientCounts(
            this.overlayClients.size,
            this.controlClientIds.size
        );
    }

    private broadcast(payload: unknown): void {
        if (!this.wss) return;

        const message = JSON.stringify(payload);
        const isOverlayEvent = [
            "state",
            "visibility",
            "retrigger",
            "style",
        ].includes((payload as any).type);

        const targets = Array.from(this.wss.clients).filter((ws) => {
            const clientId = (ws as any).clientId;
            if (!clientId) return false;

            if (this.controlClientIds.has(clientId)) {
                return !isOverlayEvent; // control clients only receive non-overlay events
            }

            const overlayMeta = this.overlayClients.get(clientId);
            if (overlayMeta) {
                return (
                    isOverlayEvent &&
                    (!this.config.token || overlayMeta.authorized)
                );
            }

            return false;
        });

        console.log(
            `Broadcasting ${(payload as any).type} to ${targets.length} clients`
        );
        targets.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now() / 1000;

            this.wss!.clients.forEach((ws) => {
                const clientId = (ws as any).clientId;
                const overlayMeta = this.overlayClients.get(clientId);
                if (!overlayMeta) return;

                if (now - overlayMeta.lastPong > HEARTBEAT_TIMEOUT_SECONDS) {
                    ws.terminate();
                    return;
                }

                if (this.config.token && !overlayMeta.authorized) return;

                ws.send(
                    JSON.stringify({ type: "heartbeat", ts: Math.floor(now) })
                );
            });
        }, HEARTBEAT_INTERVAL_SECONDS * 1000);
    }

    getRuntimeInfo() {
        return {
            version: "2.0.0",
            httpPort: this.config.httpPort,
            wsPort: this.config.wsPort,
            dataDir: this.config.dataDir,
            hymnsDir: this.config.hymnsDir,
            token: this.config.token,
            overlayProfiles: DEFAULT_OVERLAYS,
            overlayUrls: this.statusUseCase.getOverlayUrls(),
        };
    }

    async reloadHymns(): Promise<void> {
        this.hymnIndex = await this.hymnIndexService.buildIndex(
            this.config.hymnsDir
        );
    }
}
