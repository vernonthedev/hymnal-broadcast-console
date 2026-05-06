import { app, BrowserWindow, ipcMain, shell, clipboard, Menu } from "electron";
import * as fs from "fs";
import { BroadcastServer } from "../network/BroadcastServer";
import * as path from "path";
import * as net from "net";
import * as crypto from "crypto";
import * as http from "http";
import { WebSocketServer, WebSocket } from "ws";
import {
    Style,
    DEFAULT_STYLE,
    Hymn,
    StatusPayload,
    OverlayMeta,
    DEFAULT_OVERLAYS,
    RuntimeInfo,
    OverlayUrl,
} from "../../types";
import { DEFAULT_PRESETS } from "../../types/preset";

const DEFAULT_HTTP_PORT = 9999;
const DEFAULT_WS_PORT = 8765;
const HEARTBEAT_INTERVAL_SECONDS = 10;
const HEARTBEAT_TIMEOUT_SECONDS = 30;
const CHANGELOG_FILE = "CHANGELOG.md";
const APP_VERSION = "2.0.0";
const HOST = "127.0.0.1";

let mainWindow: BrowserWindow | null = null;
let hymnBroadcastServer: BroadcastServer | null = null;
let runtimeInfo: RuntimeInfo | null = null;

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

function overlayUrlsFromRuntime(info: RuntimeInfo): OverlayUrl[] {
    return info.overlayProfiles.map((overlay) => ({
        ...overlay,
        url: `http://127.0.0.1:${info.httpPort}${overlay.path}?token=${encodeURIComponent(info.token)}&wsPort=${info.wsPort}`,
    }));
}

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

        hymnBroadcastServer = new BroadcastServer(
            baseDir,
            dataDir,
            config.token,
            APP_VERSION
        );
        await hymnBroadcastServer.start(httpPort, wsPort);

        runtimeInfo = hymnBroadcastServer.getRuntimeInfo();

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
            preload: path.join(
                app.getAppPath(),
                "src/infrastructure/electron/preload.cjs"
            ),
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

    // Load the Vite-built renderer output in production, dev server in development
    if (process.env.NODE_ENV === "development" || !app.isPackaged) {
        mainWindow.loadFile(
            path.join(app.getAppPath(), "src/ui/renderer/index.html")
        );
    } else {
        mainWindow.loadFile(
            path.join(app.getAppPath(), "src/ui/renderer/dist/index.html")
        );
    }
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
