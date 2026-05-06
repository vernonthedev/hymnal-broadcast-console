import { Style, Command, CommandResult } from "../../types";

export { Command, CommandResult };

export class BroadcastCommandHandler {
    private currentHymn = "1";
    private lines: string[] = [];
    private lineIndex = 0;
    private visible = true;
    private lastError = "";
    private hymnQueue: string[] = []; // Queue of upcoming hymn numbers
    private style: Style = {
        fontSizePreset: "md",
        alignment: "center",
        safeMargin: 80,
        animation: "pop",
        speakerLabel: "",
    };

    setState(state: {
        currentHymn: string;
        lines: string[];
        lineIndex: number;
        visible: boolean;
        style: Style;
    }): void {
        this.currentHymn = state.currentHymn;
        this.lines = state.lines;
        this.lineIndex = state.lineIndex;
        this.visible = state.visible;
        this.style = state.style;
    }

    getState() {
        return {
            currentHymn: this.currentHymn,
            lines: this.lines,
            lineIndex: this.lineIndex,
            visible: this.visible,
            hymnQueue: this.hymnQueue,
            style: this.style,
            lastError: this.lastError,
        };
    }

    async handle(
        command: Command,
        readLines: (hymn: string) => Promise<string[]>
    ): Promise<CommandResult> {
        this.lastError = "";

        switch (command.cmd) {
            case "load":
                return await this.handleLoad(command, readLines);
            case "next":
                return this.handleNext();
            case "prev":
                return this.handlePrev();
            case "reset":
                return this.handleReset();
            case "blank":
                return this.handleBlank();
            case "show":
                return this.handleShow();
            case "retrigger":
            case "ping_overlay":
                return this.handleRetrigger();
            case "update_style":
                return this.handleUpdateStyle(command);
            case "save_preset":
                return this.handleSavePreset(command);
            case "apply_preset":
                return this.handleApplyPreset(command);
            case "reload_hymns":
                return { success: true, payload: { type: "reload_hymns" } };
            case "queue_add":
                return this.handleQueueAdd(command);
            case "queue_remove":
                return this.handleQueueRemove(command);
            case "queue_clear":
                return this.handleQueueClear();
            case "load_next":
                return this.handleLoadNext();
            default:
                this.lastError = `Unsupported command: ${command.cmd}`;
                return { success: false, error: this.lastError };
        }
    }

    private async handleLoad(
        command: Command,
        readLines: (hymn: string) => Promise<string[]>
    ): Promise<CommandResult> {
        const hymn = String(command.hymn || "").trim();
        if (!hymn) {
            this.lastError = "Please enter a hymn number.";
            return { success: false, error: this.lastError };
        }

        const lines = await readLines(hymn);
        if (!lines.length) {
            this.lastError = `Hymn ${hymn} was not found or is empty.`;
            return { success: false, error: this.lastError };
        }

        this.currentHymn = hymn;
        this.lines = lines;
        this.lineIndex = 0;
        this.visible = true;
        return { success: true, payload: { type: "state" } };
    }

    private handleNext(): CommandResult {
        if (this.lineIndex < this.lines.length - 1) {
            this.lineIndex++;
        }
        return { success: true, payload: { type: "state" } };
    }

    private handlePrev(): CommandResult {
        if (this.lineIndex > 0) {
            this.lineIndex--;
        }
        return { success: true, payload: { type: "state" } };
    }

    private handleReset(): CommandResult {
        this.lineIndex = 0;
        this.visible = true;
        return { success: true, payload: { type: "state" } };
    }

    private handleBlank(): CommandResult {
        this.visible = false;
        return { success: true, payload: { type: "visibility" } };
    }

    private handleShow(): CommandResult {
        this.visible = true;
        return { success: true, payload: { type: "visibility" } };
    }

    private handleRetrigger(): CommandResult {
        return { success: true, payload: { type: "retrigger" } };
    }

    private handleUpdateStyle(command: Command): CommandResult {
        if (typeof command.style !== "object" || !command.style) {
            this.lastError = "Style payload must be an object.";
            return { success: false, error: this.lastError };
        }
        this.style = { ...this.style, ...command.style };
        return { success: true, payload: { type: "style" } };
    }

    private handleSavePreset(command: Command): CommandResult {
        const name = String(command.name || "").trim();
        if (!name) {
            this.lastError = "Please enter a preset name.";
            return { success: false, error: this.lastError };
        }
        return { success: true, payload: { type: "save_preset", name } };
    }

    private handleApplyPreset(command: Command): CommandResult {
        const name = String(command.name || "").trim();
        return { success: true, payload: { type: "apply_preset", name } };
    }

    private handleQueueAdd(command: Command): CommandResult {
        const hymn = String(command.hymn || "").trim();
        if (!hymn) {
            this.lastError = "Please enter a hymn number to add to queue.";
            return { success: false, error: this.lastError };
        }
        if (!this.hymnQueue.includes(hymn)) {
            this.hymnQueue.push(hymn);
        }
        return { success: true, payload: { type: "hymn_queue_updated" } };
    }

    private handleQueueRemove(command: Command): CommandResult {
        const hymn = String(command.hymn || "").trim();
        if (!hymn) {
            this.lastError = "Please enter a hymn number to remove from queue.";
            return { success: false, error: this.lastError };
        }
        const index = this.hymnQueue.indexOf(hymn);
        if (index === -1) {
            this.lastError = `Hymn ${hymn} is not in the queue.`;
            return { success: false, error: this.lastError };
        }
        this.hymnQueue.splice(index, 1);
        return { success: true, payload: { type: "hymn_queue_updated" } };
    }

    private handleQueueClear(): CommandResult {
        this.hymnQueue = [];
        return { success: true, payload: { type: "hymn_queue_updated" } };
    }

    private handleLoadNext(): CommandResult {
        if (this.hymnQueue.length === 0) {
            this.lastError = "No hymns in queue to load.";
            return { success: false, error: this.lastError };
        }
        // This will be handled by the caller to actually load the next hymn
        return {
            success: true,
            payload: {
                type: "load_next_from_queue",
                nextHymn: this.hymnQueue[0],
            },
        };
    }

    getCurrentText(): string {
        if (!this.lines || this.lineIndex >= this.lines.length) {
            return "";
        }
        return this.lines[this.lineIndex];
    }

    getNextHymns(): string[] {
        return [...this.hymnQueue];
    }
}
