declare global {
    interface Window {
        desktopApi: {
            getRuntime: () => Promise<any>;
            copyText: (text: string) => Promise<boolean>;
            openExternal: (target: string) => Promise<boolean>;
            openPath: (target: string) => Promise<boolean>;
            getVersion: () => Promise<string>;
            getReleaseInfo: () => Promise<any>;
            minimizeWindow: () => Promise<boolean>;
            closeWindow: () => Promise<boolean>;
            onBackendEvent: (callback: (payload: any) => void) => () => void;
        };
    }
}

console.log("Renderer script loading");

const MAX_LOG_LINES = 9;
const MAX_FINDER_RESULTS = 6;
const MAX_PRELOAD_WAIT_MS = 5000;

function escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

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

interface Status {
    current_hymn: string;
    line_index: number;
    total_lines: number;
    text: string;
    previous_text: string;
    next_text: string;
    visible: boolean;
    connected_clients: number;
    control_clients: number;
    style: any;
    presets: Record<string, any>;
    http_port?: number;
    ws_port?: number;
}

interface Hymn {
    number: string;
    preview: string;
}

interface Elements {
    serverPhase: HTMLElement;
    serverPorts: HTMLElement;
    hymnInput: HTMLInputElement;
    hymnSearchResults: HTMLElement;
    hymnSearchPopover: HTMLElement;
    finderResultsCount: HTMLElement;
    finderSelectionNumber: HTMLElement;
    finderSelectionPreview: HTMLElement;
    loadBtn: HTMLButtonElement;
    prevBtn: HTMLButtonElement;
    nextBtn: HTMLButtonElement;
    resetBtn: HTMLButtonElement;
    blankBtn: HTMLButtonElement;
    showBtn: HTMLButtonElement;
    retriggerBtn: HTMLButtonElement;
    reloadIndexBtn: HTMLButtonElement;
    openUrlsBtn: HTMLButtonElement;
    openHelpBtn: HTMLButtonElement;
    openAboutBtn: HTMLButtonElement;
    windowMinimizeBtn: HTMLButtonElement;
    windowCloseBtn: HTMLButtonElement;
    prevLinePreview: HTMLElement;
    currentLinePreview: HTMLElement;
    nextLinePreview: HTMLElement;
    currentHymn: HTMLElement;
    lineMeta: HTMLElement;
    overlayCount: HTMLElement;
    visibilityMeta: HTMLElement;
    overlayUrlList: HTMLElement;
    copyDiagnosticsBtn: HTMLButtonElement;
    openHymnsBtn: HTMLButtonElement;
    logOutput: HTMLElement;
    toastRegion: HTMLElement;
    modalOverlay: HTMLElement;
    modalEyebrow: HTMLElement;
    modalTitle: HTMLElement;
    modalBody: HTMLElement;
    modalCloseBtn: HTMLButtonElement;
    speakerTemplate: HTMLSelectElement;
    fontSize: HTMLSelectElement;
    alignment: HTMLSelectElement;
    animation: HTMLSelectElement;
    safeMargin: HTMLInputElement;
    speaker: HTMLInputElement;
    presetSelect: HTMLSelectElement;
    presetName: HTMLInputElement;
    applyPresetBtn: HTMLButtonElement;
    savePresetBtn: HTMLButtonElement;
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
};

let elements: Elements | null = null;

function initElements(): void {
    elements = {
        serverPhase: document.getElementById("server-phase") as HTMLElement,
        serverPorts: document.getElementById("server-ports") as HTMLElement,
        hymnInput: document.getElementById("hymn-input") as HTMLInputElement,
        hymnSearchResults: document.getElementById(
            "hymn-search-results"
        ) as HTMLElement,
        hymnSearchPopover: document.getElementById(
            "hymn-search-popover"
        ) as HTMLElement,
        finderResultsCount: document.getElementById(
            "finder-results-count"
        ) as HTMLElement,
        finderSelectionNumber: document.getElementById(
            "finder-selection-number"
        ) as HTMLElement,
        finderSelectionPreview: document.getElementById(
            "finder-selection-preview"
        ) as HTMLElement,
        loadBtn: document.getElementById("load-btn") as HTMLButtonElement,
        prevBtn: document.getElementById("prev-btn") as HTMLButtonElement,
        nextBtn: document.getElementById("next-btn") as HTMLButtonElement,
        resetBtn: document.getElementById("reset-btn") as HTMLButtonElement,
        blankBtn: document.getElementById("blank-btn") as HTMLButtonElement,
        showBtn: document.getElementById("show-btn") as HTMLButtonElement,
        retriggerBtn: document.getElementById(
            "retrigger-btn"
        ) as HTMLButtonElement,
        reloadIndexBtn: document.getElementById(
            "reload-index-btn"
        ) as HTMLButtonElement,
        openUrlsBtn: document.getElementById(
            "open-urls-btn"
        ) as HTMLButtonElement,
        openHelpBtn: document.getElementById(
            "open-help-btn"
        ) as HTMLButtonElement,
        openAboutBtn: document.getElementById(
            "open-about-btn"
        ) as HTMLButtonElement,
        windowMinimizeBtn: document.getElementById(
            "window-minimize-btn"
        ) as HTMLButtonElement,
        windowCloseBtn: document.getElementById(
            "window-close-btn"
        ) as HTMLButtonElement,
        prevLinePreview: document.getElementById(
            "prev-line-preview"
        ) as HTMLElement,
        currentLinePreview: document.getElementById(
            "current-line-preview"
        ) as HTMLElement,
        nextLinePreview: document.getElementById(
            "next-line-preview"
        ) as HTMLElement,
        currentHymn: document.getElementById("current-hymn") as HTMLElement,
        lineMeta: document.getElementById("line-meta") as HTMLElement,
        overlayCount: document.getElementById("overlay-count") as HTMLElement,
        visibilityMeta: document.getElementById(
            "visibility-meta"
        ) as HTMLElement,
        overlayUrlList: document.getElementById(
            "overlay-url-list"
        ) as HTMLElement,
        copyDiagnosticsBtn: document.getElementById(
            "copy-diagnostics-btn"
        ) as HTMLButtonElement,
        openHymnsBtn: document.getElementById(
            "open-hymns-btn"
        ) as HTMLButtonElement,
        logOutput: document.getElementById("log-output") as HTMLElement,
        toastRegion: document.getElementById("toast-region") as HTMLElement,
        modalOverlay: document.getElementById("modal-overlay") as HTMLElement,
        modalEyebrow: document.getElementById("modal-eyebrow") as HTMLElement,
        modalTitle: document.getElementById("modal-title") as HTMLElement,
        modalBody: document.getElementById("modal-body") as HTMLElement,
        modalCloseBtn: document.getElementById(
            "modal-close-btn"
        ) as HTMLButtonElement,
        speakerTemplate: document.getElementById(
            "speaker-template-select"
        ) as HTMLSelectElement,
        fontSize: document.getElementById(
            "font-size-select"
        ) as HTMLSelectElement,
        alignment: document.getElementById(
            "alignment-select"
        ) as HTMLSelectElement,
        animation: document.getElementById(
            "animation-select"
        ) as HTMLSelectElement,
        safeMargin: document.getElementById(
            "safe-margin-input"
        ) as HTMLInputElement,
        speaker: document.getElementById("speaker-input") as HTMLInputElement,
        presetSelect: document.getElementById(
            "preset-select"
        ) as HTMLSelectElement,
        presetName: document.getElementById(
            "preset-name-input"
        ) as HTMLInputElement,
        applyPresetBtn: document.getElementById(
            "apply-preset-btn"
        ) as HTMLButtonElement,
        savePresetBtn: document.getElementById(
            "save-preset-btn"
        ) as HTMLButtonElement,
    };
}

function renderLogs(): void {
    if (!elements!.logOutput) {
        return;
    }
    elements!.logOutput.textContent = state.logLines.length
        ? state.logLines.join("\n")
        : "Waiting for backend logs...";
}

function appendLog(message: string): void {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    state.logLines = [line, ...state.logLines].slice(0, MAX_LOG_LINES);
    renderLogs();
}

function showToast(message: string, level: string = "info"): void {
    const toast = document.createElement("div");
    toast.className = `toast toast-${level}`;
    toast.textContent = message;
    elements!.toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
}

function closeModal(): void {
    elements!.modalOverlay?.classList.add("is-hidden");
}

function openModal({
    eyebrow,
    title,
    body,
}: {
    eyebrow: string;
    title: string;
    body: string;
}): void {
    if (
        !elements!.modalOverlay ||
        !elements!.modalEyebrow ||
        !elements!.modalTitle ||
        !elements!.modalBody
    ) {
        return;
    }

    elements!.modalEyebrow.textContent = eyebrow;
    elements!.modalTitle.textContent = title;
    elements!.modalBody.innerHTML = body;
    elements!.modalOverlay.classList.remove("is-hidden");
}

function buildUrlsModal(): string {
    if (!state.runtime?.overlayUrls?.length) {
        return `
      <div class="modal-copy">
        <p>Overlay URLs will appear here once the backend runtime is available.</p>
      </div>
    `;
    }

    return `
    <div class="modal-list">
      ${state.runtime.overlayUrls
          .map(
              (overlay: any) => `
            <article class="modal-card">
              <div class="modal-card-header">
                <strong>${escapeHtml(overlay.name)}</strong>
                <span>${escapeHtml(overlay.path)}</span>
              </div>
              <code>${escapeHtml(overlay.url)}</code>
              <div class="modal-actions">
                <button class="secondary-btn" type="button" data-modal-action="copy-url" data-url="${escapeHtml(overlay.url)}">Copy</button>
                <button class="primary-btn" type="button" data-modal-action="open-url" data-url="${escapeHtml(overlay.url)}">Open</button>
              </div>
            </article>
          `
          )
          .join("")}
    </div>
  `;
}

function buildHelpModal(): string {
    return `
    <div class="modal-copy">
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
    </div>
  `;
}

function buildAboutModal(): string {
    const releaseVersion = state.releaseInfo?.version || "Unavailable";
    const releaseDate = state.releaseInfo?.releasedOn || "Unavailable";
    const releaseSummary = state.releaseInfo?.summary || [];

    return `
    <div class="modal-copy">
      <p>SDA Hymnal Desktop is a local broadcast console for loading hymn lyrics and sending live overlay updates to browser-based outputs.</p>
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

function setLifecycle(phase: string, message: string): void {
    elements!.serverPhase.textContent = message;
    elements!.serverPhase.className = `phase phase-${phase}`;
}

function createIcon(iconName: string): string {
    if (iconName === "copy") {
        return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v1.125A2.625 2.625 0 0 1 13.125 21H6.375A2.625 2.625 0 0 1 3.75 18.375V8.625A2.625 2.625 0 0 1 6.375 6h1.125m3.75-3h6.375A2.625 2.625 0 0 1 20.25 5.625v9.75A2.625 2.625 0 0 1 17.625 18h-6.75a2.625 2.625 0 0 1-2.625-2.625v-9.75A2.625 2.625 0 0 1 10.875 3Z" />
      </svg>
    `;
    }

    return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-6.75-4.5L21 3m0 0-3 9m3-9h-9" />
    </svg>
  `;
}

function renderOverlayUrls(): void {
    if (!state.runtime) {
        elements!.overlayUrlList.innerHTML =
            '<p class="result-preview">Waiting for runtime details...</p>';
        return;
    }

    elements!.overlayUrlList.innerHTML = "";
    for (const overlay of state.runtime.overlayUrls) {
        const card = document.createElement("div");
        card.className = "url-card";
        card.innerHTML = `
      <div class="url-card-title">
        <strong>${escapeHtml(overlay.name)}</strong>
        <span class="badge">${escapeHtml(overlay.path.replace("/", ""))}</span>
      </div>
      <p>${escapeHtml(overlay.path)}</p>
      <code title="${escapeHtml(overlay.url)}">${escapeHtml(overlay.url)}</code>
      <div class="url-actions">
        <button data-action="copy" type="button">
          <span class="icon" aria-hidden="true">${createIcon("copy")}</span>
          Copy
        </button>
        <button data-action="open" class="primary-btn" type="button">
          <span class="icon" aria-hidden="true">${createIcon("open")}</span>
          Open
        </button>
      </div>
    `;
        const [copyBtn, openBtn] = card.querySelectorAll("button");
        copyBtn.addEventListener("click", async () => {
            await window.desktopApi.copyText(overlay.url);
            showToast(`${overlay.name} URL copied.`);
        });
        openBtn.addEventListener("click", async () => {
            await window.desktopApi.openExternal(overlay.url);
        });
        elements!.overlayUrlList.appendChild(card);
    }
}

function renderHymnOptions(): void {
    return;
}

function renderPresets(): void {
    elements!.presetSelect.innerHTML = "";
    for (const name of Object.keys(state.presets)) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        elements!.presetSelect.appendChild(option);
    }
}

function syncStyleForm(style: any = {}): void {
    if (document.activeElement !== elements!.fontSize) {
        elements!.fontSize.value = style.fontSizePreset || "md";
    }
    if (document.activeElement !== elements!.alignment) {
        elements!.alignment.value = style.alignment || "center";
    }
    if (document.activeElement !== elements!.animation) {
        elements!.animation.value = style.animation || "pop";
    }
    if (document.activeElement !== elements!.safeMargin) {
        elements!.safeMargin.value = String(style.safeMargin ?? 80);
    }
    if (document.activeElement !== elements!.speaker) {
        elements!.speaker.value = style.speakerLabel || "";
    }
    if (document.activeElement !== elements!.speakerTemplate) {
        elements!.speakerTemplate.value = style.speakerLabel || "";
    }
}

function normalizeText(value: any): string {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function getHymnTitle(item: Hymn): string {
    const preview = String(item?.preview || "").trim();
    if (!preview) {
        return "Untitled hymn";
    }

    const firstLine = preview.split(/\r?\n/)[0].trim();
    const firstSegment = firstLine.split(/[-|:]/)[0].trim();
    return firstSegment || firstLine;
}

function getMatchingHymns(query: string): Hymn[] {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
        return state.hymnIndex.slice(0, MAX_FINDER_RESULTS);
    }

    return state.hymnIndex
        .filter((item) => {
            const number = normalizeText(item.number);
            const preview = normalizeText(item.preview);
            return (
                number.startsWith(normalizedQuery) ||
                preview.includes(normalizedQuery)
            );
        })
        .slice(0, MAX_FINDER_RESULTS);
}

function getSelectedHymn(): Hymn | null {
    const typed = normalizeText(elements!.hymnInput.value);
    if (typed) {
        const exactMatch = state.hymnIndex.find(
            (item) =>
                normalizeText(item.number) === typed ||
                normalizeText(item.preview) === typed
        );
        if (exactMatch) {
            return exactMatch;
        }

        const firstMatch = getMatchingHymns(typed)[0];
        if (firstMatch) {
            return firstMatch;
        }
    }

    if (state.status?.current_hymn) {
        return (
            state.hymnIndex.find(
                (item) =>
                    normalizeText(item.number) ===
                    normalizeText(state.status?.current_hymn)
            ) || null
        );
    }

    return null;
}

function renderFinderSpotlight(): void {
    const selectedHymn = getSelectedHymn();

    if (!selectedHymn) {
        elements!.finderSelectionNumber.textContent = "No hymn selected";
        elements!.finderSelectionPreview.textContent =
            "Type a number to pull matching hymns into the quick rail.";
        return;
    }

    elements!.finderSelectionNumber.textContent = `Hymn ${selectedHymn.number}`;
    elements!.finderSelectionPreview.textContent = getHymnTitle(selectedHymn);
}

function renderFinderResults(): void {
    if (!elements!.hymnSearchResults || !elements!.finderResultsCount) {
        return;
    }
    const results = getMatchingHymns(elements!.hymnInput.value);
    const activeNumber = getSelectedHymn()?.number;
    const query = normalizeText(elements!.hymnInput.value);
    elements!.finderResultsCount.textContent = `${results.length} hymn${results.length === 1 ? "" : "s"}`;
    elements!.hymnSearchPopover?.classList.toggle(
        "is-hidden",
        !query || results.length === 0
    );
    if (state.pickerDismissed) {
        elements!.hymnSearchPopover?.classList.add("is-hidden");
    }

    elements!.hymnSearchResults.innerHTML = "";

    for (const hymn of results) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "result-card";
        if (hymn.number === activeNumber) {
            button.classList.add("is-active");
        }
        button.innerHTML = `
      <span class="result-number">#${escapeHtml(hymn.number)}</span>
      <div class="result-main">
        <span class="result-title">${escapeHtml(getHymnTitle(hymn))}</span>
        <p class="result-preview">Hymn ${escapeHtml(hymn.number)}</p>
      </div>
    `;
        button.addEventListener("click", () => {
            elements!.hymnInput.value = hymn.number;
            state.pickerDismissed = true;
            renderFinderSpotlight();
            renderFinderResults();
            elements!.hymnSearchPopover?.classList.add("is-hidden");
        });
        button.addEventListener("dblclick", () => {
            elements!.hymnInput.value = hymn.number;
            state.pickerDismissed = true;
            sendCommand({ cmd: "load", hymn: hymn.number });
            elements!.hymnSearchPopover?.classList.add("is-hidden");
        });
        elements!.hymnSearchResults.appendChild(button);
    }

    if (!results.length) {
        elements!.hymnSearchResults.innerHTML = "";
    }
}

function renderStatus(): void {
    const status = state.status;
    const runtime = state.runtime;

    // Use runtime ports as fallback if status is not yet available
    const httpPort = status?.http_port || runtime?.httpPort || "-";
    const wsPort = status?.ws_port || runtime?.wsPort || "-";

    elements!.serverPorts.textContent = `HTTP ${httpPort}, WS ${wsPort}`;

    if (!status) {
        return;
    }

    elements!.currentHymn.textContent = status.current_hymn || "-";
    elements!.lineMeta.textContent = status.total_lines
        ? `${status.line_index + 1}/${status.total_lines}`
        : "0/0";
    elements!.overlayCount.textContent = String(status.connected_clients || 0);
    elements!.visibilityMeta.textContent = status.visible ? "Shown" : "Blank";
    elements!.currentLinePreview.textContent = status.text || "(No text)";
    elements!.prevLinePreview.textContent = status.previous_text || "-";
    elements!.nextLinePreview.textContent = status.next_text || "-";
    syncStyleForm(status.style || {});

    if (status.presets) {
        state.presets = status.presets;
        renderPresets();
    }

    renderFinderSpotlight();
    renderFinderResults();
}

async function fetchJson(route: string): Promise<any> {
    if (!state.runtime) {
        throw new Error("Runtime is not available yet.");
    }
    const response = await fetch(
        `http://127.0.0.1:${state.runtime.httpPort}${route}`
    );
    if (!response.ok) {
        throw new Error(`Request failed for ${route}: ${response.status}`);
    }
    return response.json();
}

async function refreshIndexes(): Promise<void> {
    try {
        console.log("Refreshing indexes...");
        showToast("Loading hymns...", "info");
        const hymnsResponse = await fetchJson("/hymns");
        console.log("Hymns response received:", hymnsResponse);
        state.hymnIndex = hymnsResponse.items || [];
        state.presets = (await fetchJson("/presets")).items || {};
        console.log(`Loaded ${state.hymnIndex.length} hymns`);
        showToast(`Loaded ${state.hymnIndex.length} hymns`, "info");
        renderHymnOptions();
        renderPresets();
        renderFinderResults();
    } catch (error) {
        console.error("Failed to refresh indexes:", error);
        showToast("Failed to load hymns: " + (error as Error).message, "error");
    }
}

function sendCommand(payload: any): void {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        showToast("Backend socket is not ready.", "error");
        return;
    }
    state.socket.send(JSON.stringify(payload));
}

function connectSocket(): void {
    if (!state.runtime) {
        showToast("No runtime, cannot connect socket", "error");
        return;
    }

    showToast("Connecting WebSocket...", "info");
    if (state.reconnectTimer) {
        window.clearTimeout(state.reconnectTimer);
    }
    if (state.socket) {
        state.socket.close();
    }

    state.socket = new WebSocket(`ws://127.0.0.1:${state.runtime.wsPort}`);
    state.socket.addEventListener("open", () => {
        showToast("WebSocket connected", "info");
        state.socket!.send(JSON.stringify({ cmd: "hello", role: "control" }));
    });
    state.socket.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === "status") {
            showToast("Received status from backend", "info");
            state.status = payload.status;
            renderStatus();
            return;
        }
        if (payload.type === "error") {
            showToast(payload.message, "error");
            return;
        }
        if (payload.type === "hymn_index") {
            state.hymnIndex = payload.items || [];
            renderHymnOptions();
            renderFinderSpotlight();
            renderFinderResults();
            return;
        }
        if (payload.type === "state") {
            state.status = payload;
            renderStatus();
            return;
        }
        if (payload.type === "style") {
            if (state.status) {
                state.status.style = payload.style;
                renderStatus();
            }
            return;
        }
        if (payload.type === "presets") {
            state.presets = payload.items || {};
            renderPresets();
        }
    });
    state.socket.addEventListener("close", () => {
        state.reconnectTimer = window.setTimeout(connectSocket, 1200);
    });
}

function buildStylePayload(): any {
    return {
        fontSizePreset: elements!.fontSize.value,
        alignment: elements!.alignment.value,
        animation: elements!.animation.value,
        safeMargin: Number(elements!.safeMargin.value),
        speakerLabel: elements!.speaker.value.trim(),
    };
}

function queueStyleUpdate(): void {
    if (state.styleUpdateTimer) {
        window.clearTimeout(state.styleUpdateTimer);
    }
    state.styleUpdateTimer = window.setTimeout(() => {
        sendCommand({ cmd: "update_style", style: buildStylePayload() });
    }, 180);
}

async function copyDiagnostics(): Promise<void> {
    const diagnostics = {
        appVersion: state.appVersion,
        runtime: state.runtime,
        status: state.status,
        timestamp: new Date().toISOString(),
    };
    await window.desktopApi.copyText(JSON.stringify(diagnostics, null, 2));
    showToast("Diagnostics copied.");
}

function bindEvents(): void {
    elements!.loadBtn.addEventListener("click", () => {
        sendCommand({ cmd: "load", hymn: elements!.hymnInput.value.trim() });
    });
    elements!.prevBtn.addEventListener("click", () =>
        sendCommand({ cmd: "prev" })
    );
    elements!.nextBtn.addEventListener("click", () =>
        sendCommand({ cmd: "next" })
    );
    elements!.resetBtn.addEventListener("click", () =>
        sendCommand({ cmd: "reset" })
    );
    elements!.blankBtn.addEventListener("click", () =>
        sendCommand({ cmd: "blank" })
    );
    elements!.showBtn.addEventListener("click", () =>
        sendCommand({ cmd: "show" })
    );
    elements!.retriggerBtn.addEventListener("click", () =>
        sendCommand({ cmd: "retrigger" })
    );
    elements!.reloadIndexBtn.addEventListener("click", () =>
        sendCommand({ cmd: "reload_hymns" })
    );
    elements!.openUrlsBtn.addEventListener("click", () => {
        openModal({
            eyebrow: "URLs",
            title: "Overlay URLs",
            body: buildUrlsModal(),
        });
    });
    elements!.openHelpBtn.addEventListener("click", () => {
        openModal({
            eyebrow: "Help",
            title: "Using the console",
            body: buildHelpModal(),
        });
    });
    elements!.openAboutBtn.addEventListener("click", () => {
        openModal({
            eyebrow: "About",
            title: "About this application",
            body: buildAboutModal(),
        });
    });
    elements!.windowMinimizeBtn.addEventListener("click", async () => {
        await window.desktopApi.minimizeWindow();
    });
    elements!.windowCloseBtn.addEventListener("click", async () => {
        await window.desktopApi.closeWindow();
    });
    elements!.copyDiagnosticsBtn?.addEventListener("click", copyDiagnostics);
    elements!.modalCloseBtn?.addEventListener("click", closeModal);
    elements!.openHymnsBtn.addEventListener("click", async () => {
        if (state.runtime?.hymnsDir) {
            await window.desktopApi.openPath(state.runtime.hymnsDir);
        }
    });

    elements!.speakerTemplate.addEventListener("change", () => {
        elements!.speaker.value = elements!.speakerTemplate.value;
        queueStyleUpdate();
    });

    [
        elements!.fontSize,
        elements!.alignment,
        elements!.animation,
        elements!.safeMargin,
    ].forEach((input) => {
        input.addEventListener("change", () => {
            queueStyleUpdate();
        });
    });

    [elements!.speaker].forEach((input) => {
        input.addEventListener("input", queueStyleUpdate);
        input.addEventListener("change", queueStyleUpdate);
    });

    elements!.applyPresetBtn.addEventListener("click", () => {
        sendCommand({
            cmd: "apply_preset",
            name: elements!.presetSelect.value,
        });
    });

    elements!.savePresetBtn.addEventListener("click", () => {
        const name = elements!.presetName.value.trim();
        if (!name) {
            showToast("Preset name is required.", "error");
            return;
        }
        sendCommand({ cmd: "update_style", style: buildStylePayload() });
        sendCommand({ cmd: "save_preset", name });
        elements!.presetName.value = "";
    });

    elements!.hymnInput.addEventListener("input", () => {
        state.pickerDismissed = false;
        renderFinderSpotlight();
        renderFinderResults();
    });

    elements!.hymnInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            const hymnValue = elements!.hymnInput.value.trim();
            if (hymnValue) {
                sendCommand({ cmd: "load", hymn: hymnValue });
                state.pickerDismissed = true;
                renderFinderResults();
                elements!.hymnSearchPopover?.classList.add("is-hidden");
            }
        }
    });

    elements!.hymnInput.addEventListener("focus", () => {
        renderFinderResults();
    });

    elements!.loadBtn.addEventListener("click", () => {
        state.pickerDismissed = true;
        elements!.hymnSearchPopover?.classList.add("is-hidden");
    });

    document.addEventListener("click", (event) => {
        const target = event.target as Node;
        if (
            elements!.hymnSearchPopover &&
            target instanceof Node &&
            !elements!.hymnSearchPopover.contains(target) &&
            !elements!.hymnInput.contains(target)
        ) {
            state.pickerDismissed = true;
            elements!.hymnSearchPopover.classList.add("is-hidden");
        }
    });

    elements!.modalOverlay?.addEventListener("click", (event) => {
        if (event.target === elements!.modalOverlay) {
            closeModal();
        }
    });

    elements!.modalBody?.addEventListener("click", async (event) => {
        const target = event.target as HTMLElement;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        const actionElement = target.closest(
            "[data-modal-action]"
        ) as HTMLElement;
        if (!(actionElement instanceof HTMLElement)) {
            return;
        }

        const action = actionElement.dataset.modalAction;
        const url = actionElement.dataset.url;

        if (!url) {
            return;
        }

        if (action === "copy-url") {
            await window.desktopApi.copyText(url);
            showToast("Overlay URL copied.");
            return;
        }

        if (action === "open-url") {
            await window.desktopApi.openExternal(url);
        }
    });

    window.addEventListener("keydown", (event) => {
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
    });
}

async function init(): Promise<void> {
    console.log("Initializing renderer");
    initElements();

    // Wait for desktopApi to be available with timeout
    const waitForPreload = (): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (window.desktopApi) {
                resolve();
                return;
            }
            const timeout = setTimeout(() => {
                reject(new Error("Preload script did not load in time"));
            }, MAX_PRELOAD_WAIT_MS);
            const check = setInterval(() => {
                if (window.desktopApi) {
                    clearTimeout(timeout);
                    clearInterval(check);
                    resolve();
                }
            }, 10);
        });
    };

    try {
        await waitForPreload();
    } catch (error) {
        showToast(
            "Failed to initialize: preload script not available",
            "error"
        );
        console.error("Preload initialization failed:", error);
        return;
    }

    console.log("Desktop API available");
    bindEvents();
    renderFinderResults();
    window.desktopApi.onBackendEvent(async (event: any) => {
        if (event.type === "runtime") {
            state.runtime = event.runtime;
            renderOverlayUrls();
            renderStatus();
            connectSocket();
            await refreshIndexes();
            return;
        }

        if (event.type === "status") {
            state.status = event.status;
            renderStatus();
            return;
        }

        if (event.type === "lifecycle") {
            setLifecycle(event.phase, event.message);
            appendLog(event.message);
            return;
        }

        if (event.type === "toast") {
            showToast(event.message, event.level || "info");
            appendLog(event.message);
            return;
        }

        if (event.type === "log") {
            appendLog(event.message);
        }
    });

    const runtime = await window.desktopApi.getRuntime();
    if (runtime) {
        state.runtime = runtime;
        renderOverlayUrls();
        connectSocket();
        await refreshIndexes();
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        console.log("DOM ready, initializing");
        init();
    });
} else {
    console.log("DOM already ready, initializing");
    init();
}
