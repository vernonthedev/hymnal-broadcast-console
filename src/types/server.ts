import { Style } from "./style";

export interface OverlayState {
    type: string;
    httpPort: number;
    wsPort: number;
    hymn: string;
    lineIndex: number;
    totalLines: number;
    text: string;
    visible: boolean;
    style: Style;
    connectedClients: number;
    controlClients: number;
    error: string;
    hymn_queue?: string[];
}

export function createOverlayState(
    partial: Partial<OverlayState> = {}
): OverlayState {
    return {
        type: "state",
        httpPort: 0,
        wsPort: 0,
        hymn: "",
        lineIndex: 0,
        totalLines: 0,
        text: "",
        visible: true,
        style: {
            fontSizePreset: "md",
            alignment: "center",
            safeMargin: 80,
            animation: "pop",
            speakerLabel: "",
        },
        connectedClients: 0,
        controlClients: 0,
        error: "",
        ...partial,
    };
}

export interface StatusPayload {
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
    overlay_profiles: import("./overlay").OverlayProfile[];
    last_error: string;
    token_enabled: boolean;
    hymn_queue: string[];
}

export interface OverlayMeta {
    lastPong: number;
    authorized: boolean;
    role: string;
}

export const DEFAULT_OVERLAYS: import("./overlay").OverlayProfile[] = [
    {
        id: "lowerthird",
        name: "Lower Third",
        path: "/overlays/lowerthird.html",
    },
    { id: "stage", name: "Stage", path: "/overlays/stage.html" },
    { id: "lyrics", name: "Lyrics", path: "/overlays/lyrics.html" },
    { id: "next-hymns", name: "Next Hymns", path: "/overlays/next-hymns.html" },
];
