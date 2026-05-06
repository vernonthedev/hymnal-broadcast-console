(function () {
    const textEl = document.getElementById("text") as HTMLElement | null;
    const cardEl = document.getElementById(
        "overlay-card"
    ) as HTMLElement | null;
    const speakerEl = document.getElementById("speaker") as HTMLElement | null;
    const statusEl = document.getElementById(
        "overlay-status"
    ) as HTMLElement | null;
    const nextHymnsListEl = document.getElementById(
        "next-hymns-list"
    ) as HTMLElement | null;
    const profile = document.body.dataset.profile || "lowerthird";
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    const wsPort = Number(params.get("wsPort")) || 8765;
    const wsUrl = `ws://127.0.0.1:${wsPort}`;

    interface OverlayStyle {
        fontSizePreset?: string;
        alignment?: string;
        safeMargin?: number;
        animation?: string;
        speakerLabel?: string;
    }

    interface OverlayState {
        text: string;
        visible: boolean;
        style: OverlayStyle;
        hymn_queue?: string[];
    }

    interface WebSocketPayload {
        type: string;
        ts?: number;
        message?: string;
    }

    let socket: WebSocket | null = null;
    let reconnectDelay = 500;
    let reconnectTimer: ReturnType<typeof setTimeout> | number | null = null;
    let currentState: OverlayState = {
        text: "",
        visible: true,
        style: {},
    };

    function showStatus(message: string): void {
        if (!message) {
            if (statusEl) statusEl.textContent = "";
            statusEl?.classList.remove("visible");
            return;
        }
        if (statusEl) statusEl.textContent = message;
        statusEl?.classList.add("visible");
    }

    function applyStyle(style: OverlayStyle): void {
        const root = document.documentElement;
        const fontSizeMap: Record<string, string> = {
            sm: "34px",
            md: "48px",
            lg: "60px",
            xl: "74px",
        };

        root.style.setProperty(
            "--overlay-font-size",
            fontSizeMap[style.fontSizePreset || ""] || "48px"
        );
        root.style.setProperty(
            "--overlay-align",
            style.alignment || (profile === "lyrics" ? "left" : "center")
        );
        root.style.setProperty(
            "--overlay-safe-margin",
            `${Number(style.safeMargin || 80)}px`
        );

        document.body.dataset.animation = style.animation || "pop";
        if (speakerEl) speakerEl.textContent = style.speakerLabel || "";
        speakerEl?.classList.toggle("visible", Boolean(style.speakerLabel));
    }

    function triggerAnimation(): void {
        cardEl?.classList.remove("animate");
        void cardEl?.offsetWidth;
        cardEl?.classList.add("animate");
    }

    function renderState(
        nextState: Partial<OverlayState>,
        shouldRetrigger: boolean
    ): void {
        currentState = {
            ...currentState,
            ...nextState,
            style: {
                ...currentState.style,
                ...(nextState.style || {}),
            },
        };

        if (profile === "next-hymns") {
            // Special handling for next hymns overlay
            if (nextHymnsListEl) {
                const hymnQueue = currentState.hymn_queue || [];
                if (hymnQueue.length > 0) {
                    nextHymnsListEl.innerHTML = hymnQueue
                        .map(
                            (hymn, index) =>
                                `<div class="next-hymn-item">Next: Hymn ${hymn}</div>`
                        )
                        .join("");
                } else {
                    nextHymnsListEl.innerHTML =
                        '<div class="next-hymn-item">No upcoming hymns</div>';
                }
            }
            cardEl?.classList.toggle("visible", Boolean(currentState.visible));
        } else {
            // Standard text overlay handling
            if (textEl) textEl.textContent = currentState.text || "";
            applyStyle(currentState.style || {});
            cardEl?.classList.toggle(
                "visible",
                Boolean(currentState.visible && currentState.text)
            );
            cardEl?.classList.toggle(
                "blank",
                !currentState.visible || !currentState.text
            );
        }

        if (shouldRetrigger) {
            triggerAnimation();
        }
    }

    function scheduleReconnect(): void {
        if (reconnectTimer) {
            return;
        }
        showStatus("Reconnecting");
        reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            reconnectDelay = Math.min(reconnectDelay * 1.8, 8000);
            connect();
        }, reconnectDelay);
    }

    function handleMessage(event: MessageEvent): void {
        const payload = JSON.parse(event.data) as WebSocketPayload;
        if (payload.type === "hello") {
            socket?.send(JSON.stringify({ cmd: "hello", role: "overlay" }));
            if (token) {
                socket?.send(JSON.stringify({ cmd: "auth", token }));
            }
            return;
        }

        if (payload.type === "heartbeat") {
            socket?.send(JSON.stringify({ cmd: "pong", ts: payload.ts }));
            return;
        }

        if (payload.type === "error") {
            showStatus(payload.message || "Connection error");
            return;
        }

        if (
            payload.type === "state" ||
            payload.type === "visibility" ||
            payload.type === "style" ||
            payload.type === "retrigger"
        ) {
            const statePayload = payload as unknown as OverlayState;
            renderState(statePayload, payload.type !== "style");
            showStatus("");
        }
    }

    function connect(): void {
        socket = new WebSocket(wsUrl);
        socket.addEventListener("open", () => {
            reconnectDelay = 500;
            showStatus("");
        });
        socket.addEventListener("message", handleMessage);
        socket.addEventListener("close", () => {
            scheduleReconnect();
        });
        socket.addEventListener("error", () => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
        });
    }

    connect();
})();
