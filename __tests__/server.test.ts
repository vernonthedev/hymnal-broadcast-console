import {
    OverlayState,
    createOverlayState,
    DEFAULT_OVERLAYS,
    StatusPayload,
} from "../src/types/server";
import { DEFAULT_STYLE } from "../src/types/style";

const createMockStatusPayload = (): StatusPayload => ({
    version: "2.0.0",
    http_port: 9999,
    ws_port: 8765,
    current_hymn: "1",
    line_index: 0,
    total_lines: 5,
    text: "Amazing grace how sweet the sound",
    previous_text: "",
    next_text: "That saved a wretch like me",
    visible: true,
    connected_clients: 2,
    control_clients: 1,
    style: { ...DEFAULT_STYLE },
    presets: {
        Default: { ...DEFAULT_STYLE },
        Stage: {
            fontSizePreset: "xl",
            alignment: "center",
            safeMargin: 120,
            animation: "fade",
            speakerLabel: "",
        },
    },
    overlay_profiles: [...DEFAULT_OVERLAYS],
    last_error: "",
    token_enabled: true,
});

describe("Server State Types", () => {
    describe("createOverlayState", () => {
        it("should create default state", () => {
            const state = createOverlayState();
            expect(state.type).toBe("state");
            expect(state.httpPort).toBe(0);
            expect(state.wsPort).toBe(0);
            expect(state.hymn).toBe("");
            expect(state.lineIndex).toBe(0);
            expect(state.totalLines).toBe(0);
            expect(state.text).toBe("");
            expect(state.visible).toBe(true);
            expect(state.style).toEqual(DEFAULT_STYLE);
            expect(state.connectedClients).toBe(0);
            expect(state.controlClients).toBe(0);
            expect(state.error).toBe("");
        });

        it("should create state with overrides", () => {
            const state = createOverlayState({
                type: "visibility",
                hymn: "1",
                lineIndex: 2,
                visible: false,
            });
            expect(state.type).toBe("visibility");
            expect(state.hymn).toBe("1");
            expect(state.lineIndex).toBe(2);
            expect(state.visible).toBe(false);
            // Unset values should still be defaults
            expect(state.style).toEqual(DEFAULT_STYLE);
        });

        it("should preserve default when partial override", () => {
            const state = createOverlayState({ text: "Test text" });
            expect(state.text).toBe("Test text");
            expect(state.type).toBe("state");
            expect(state.visible).toBe(true);
        });
    });

    describe("OverlayState type validation", () => {
        it("should accept complete state object", () => {
            const state: OverlayState = {
                type: "state",
                httpPort: 9999,
                wsPort: 8765,
                hymn: "42",
                lineIndex: 1,
                totalLines: 5,
                text: "Amazing grace how sweet the sound",
                visible: true,
                style: DEFAULT_STYLE,
                connectedClients: 2,
                controlClients: 1,
                error: "",
            };
            expect(state.httpPort).toBe(9999);
            expect(state.wsPort).toBe(8765);
            expect(state.hymn).toBe("42");
        });

        it("should handle error state", () => {
            const state: OverlayState = createOverlayState({
                error: "Hymn not found",
                type: "error",
            });
            expect(state.error).toBe("Hymn not found");
        });
    });

    describe("DEFAULT_OVERLAYS", () => {
        it("should have correct number of overlays", () => {
            expect(DEFAULT_OVERLAYS.length).toBe(3);
        });

        it("should have lowerthird overlay", () => {
            const lowerthird = DEFAULT_OVERLAYS.find(
                (o) => o.id === "lowerthird"
            );
            expect(lowerthird).toBeDefined();
            expect(lowerthird?.name).toBe("Lower Third");
            expect(lowerthird?.path).toBe("/overlays/lowerthird.html");
        });

        it("should have stage overlay", () => {
            const stage = DEFAULT_OVERLAYS.find((o) => o.id === "stage");
            expect(stage).toBeDefined();
            expect(stage?.name).toBe("Stage");
            expect(stage?.path).toBe("/overlays/stage.html");
        });

        it("should have lyrics overlay", () => {
            const lyrics = DEFAULT_OVERLAYS.find((o) => o.id === "lyrics");
            expect(lyrics).toBeDefined();
            expect(lyrics?.name).toBe("Lyrics");
            expect(lyrics?.path).toBe("/overlays/lyrics.html");
        });
    });
});

describe("StatusPayload Integration", () => {
    it("should create complete status payload", () => {
        const payload = createMockStatusPayload();
        expect(payload.version).toBe("2.0.0");
        expect(payload.current_hymn).toBe("1");
        expect(payload.text).toBe("Amazing grace how sweet the sound");
        expect(payload.visible).toBe(true);
    });

    it("should track line navigation", () => {
        const payload = createMockStatusPayload();
        expect(payload.line_index).toBe(0);
        expect(payload.total_lines).toBe(5);
        expect(payload.previous_text).toBe("");
        expect(payload.next_text).toBe("That saved a wretch like me");
    });

    it("should track client connections", () => {
        const payload = createMockStatusPayload();
        expect(payload.connected_clients).toBe(2);
        expect(payload.control_clients).toBe(1);
    });

    it("should include presets", () => {
        const payload = createMockStatusPayload();
        expect(Object.keys(payload.presets)).toContain("Default");
        expect(Object.keys(payload.presets)).toContain("Stage");
        expect(payload.presets.Stage.fontSizePreset).toBe("xl");
    });

    it("should include overlay profiles", () => {
        const payload = createMockStatusPayload();
        expect(payload.overlay_profiles).toEqual(DEFAULT_OVERLAYS);
    });

    it("should handle error state", () => {
        const payload = createMockStatusPayload();
        payload.last_error = "Hymn 999 not found";
        payload.current_hymn = "999";
        expect(payload.last_error).toBe("Hymn 999 not found");
    });

    it("should handle hidden state", () => {
        const payload = createMockStatusPayload();
        payload.visible = false;
        expect(payload.visible).toBe(false);
    });
});

describe("WebSocket Event Types", () => {
    describe("Hello message", () => {
        it("should create hello message without auth", () => {
            const message = {
                type: "hello",
                requiresAuth: false,
                overlayProfiles: DEFAULT_OVERLAYS,
                httpPort: 9999,
                wsPort: 8765,
            };
            expect(message.type).toBe("hello");
            expect(message.requiresAuth).toBe(false);
            expect(message.overlayProfiles.length).toBe(3);
        });

        it("should create hello message with auth", () => {
            const message = {
                type: "hello",
                requiresAuth: true,
                overlayProfiles: DEFAULT_OVERLAYS,
                httpPort: 9999,
                wsPort: 8765,
            };
            expect(message.requiresAuth).toBe(true);
        });
    });

    describe("Heartbeat message", () => {
        it("should create heartbeat message", () => {
            const message = {
                type: "heartbeat",
                ts: Math.floor(Date.now() / 1000),
            };
            expect(message.type).toBe("heartbeat");
            expect(typeof message.ts).toBe("number");
        });
    });

    describe("Error message", () => {
        it("should create error message", () => {
            const message = {
                type: "error",
                message: "Control token rejected.",
            };
            expect(message.type).toBe("error");
            expect(message.message).toBe("Control token rejected.");
        });
    });

    describe("Status message", () => {
        it("should wrap status in message", () => {
            const message = {
                type: "status",
                status: createMockStatusPayload(),
            };
            expect(message.type).toBe("status");
            expect(message.status.current_hymn).toBe("1");
        });
    });
});
