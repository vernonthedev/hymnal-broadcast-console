import {
    Style,
    OverlayState,
    createOverlayState,
    StatusPayload,
    RuntimeInfo,
    OverlayProfile,
    OverlayUrl,
} from "../../types";

export {
    StatusPayload,
    RuntimeInfo,
    OverlayProfile,
    OverlayUrl,
    createOverlayState,
};

const OVERLAYS: OverlayProfile[] = [
    {
        id: "lowerthird",
        name: "Lower Third",
        path: "/overlays/lowerthird.html",
    },
    { id: "stage", name: "Stage", path: "/overlays/stage.html" },
    { id: "lyrics", name: "Lyrics", path: "/overlays/lyrics.html" },
];

export class BroadcastStatusUseCase {
    private version: string;
    private httpPort = 0;
    private wsPort = 0;
    private token: string;
    private currentHymn = "1";
    private lines: string[] = [];
    private lineIndex = 0;
    private visible = true;
    private lastError = "";
    private style: Style = {
        fontSizePreset: "md",
        alignment: "center",
        safeMargin: 80,
        animation: "pop",
        speakerLabel: "",
    };
    private presets: Record<string, Style> = {};
    private connectedClients = 0;
    private controlClients = 0;
    private hymnQueue: string[] = [];

    constructor(version: string, token: string) {
        this.version = version;
        this.token = token;
    }

    setPorts(httpPort: number, wsPort: number): void {
        this.httpPort = httpPort;
        this.wsPort = wsPort;
    }

    setPresets(presets: Record<string, Style>): void {
        this.presets = presets;
    }

    setHymnState(
        currentHymn: string,
        lines: string[],
        lineIndex: number,
        visible: boolean
    ): void {
        this.currentHymn = currentHymn;
        this.lines = lines;
        this.lineIndex = lineIndex;
        this.visible = visible;
    }

    setStyle(style: Style): void {
        this.style = style;
    }

    setLastError(error: string): void {
        this.lastError = error;
    }

    setClientCounts(connectedClients: number, controlClients: number): void {
        this.connectedClients = connectedClients;
        this.controlClients = controlClients;
    }

    setHymnQueue(hymnQueue: string[]): void {
        this.hymnQueue = hymnQueue;
    }

    getStatus(): StatusPayload {
        const text = this.getCurrentText();
        return {
            version: this.version,
            http_port: this.httpPort,
            ws_port: this.wsPort,
            current_hymn: this.currentHymn,
            line_index: this.lineIndex,
            total_lines: this.lines.length,
            text,
            previous_text:
                this.lineIndex > 0 ? this.lines[this.lineIndex - 1] : "",
            next_text:
                this.lineIndex + 1 < this.lines.length
                    ? this.lines[this.lineIndex + 1]
                    : "",
            visible: this.visible,
            connected_clients: this.connectedClients,
            control_clients: this.controlClients,
            style: this.style,
            presets: this.presets,
            overlay_profiles: OVERLAYS,
            last_error: this.lastError,
            token_enabled: !!this.token,
            hymn_queue: this.hymnQueue,
        };
    }

    getOverlayPayload(event: string = "state"): OverlayState {
        return createOverlayState({
            type: event,
            httpPort: this.httpPort,
            wsPort: this.wsPort,
            hymn: this.currentHymn,
            lineIndex: this.lineIndex,
            totalLines: this.lines.length,
            text: this.getCurrentText(),
            visible: this.visible,
            style: this.style,
            connectedClients: this.connectedClients,
            controlClients: this.controlClients,
            error: this.lastError,
            hymn_queue: this.hymnQueue,
        });
    }

    private getCurrentText(): string {
        if (!this.lines || this.lineIndex >= this.lines.length) return "";
        return this.lines[this.lineIndex];
    }

    getOverlayUrls(): OverlayUrl[] {
        return OVERLAYS.map((profile) => ({
            ...profile,
            url: `http://127.0.0.1:${this.httpPort}${profile.path}?token=${encodeURIComponent(this.token)}&wsPort=${this.wsPort}`,
        }));
    }

    getRuntimeInfo(): RuntimeInfo {
        return {
            version: this.version,
            httpPort: this.httpPort,
            wsPort: this.wsPort,
            dataDir: "",
            hymnsDir: "",
            token: this.token,
            overlayProfiles: OVERLAYS,
            overlayUrls: this.getOverlayUrls(),
        };
    }
}
