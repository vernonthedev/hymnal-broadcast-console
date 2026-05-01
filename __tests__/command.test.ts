import { Command, CommandResult } from "../src/types/command";
import { Style, DEFAULT_STYLE } from "../src/types/style";

describe("Command Types", () => {
    describe("Command structure", () => {
        it("should accept load command", () => {
            const cmd: Command = { cmd: "load", hymn: "1" };
            expect(cmd.cmd).toBe("load");
            expect(cmd.hymn).toBe("1");
        });

        it("should accept next command", () => {
            const cmd: Command = { cmd: "next" };
            expect(cmd.cmd).toBe("next");
        });

        it("should accept prev command", () => {
            const cmd: Command = { cmd: "prev" };
            expect(cmd.cmd).toBe("prev");
        });

        it("should accept reset command", () => {
            const cmd: Command = { cmd: "reset" };
            expect(cmd.cmd).toBe("reset");
        });

        it("should accept blank command", () => {
            const cmd: Command = { cmd: "blank" };
            expect(cmd.cmd).toBe("blank");
        });

        it("should accept show command", () => {
            const cmd: Command = { cmd: "show" };
            expect(cmd.cmd).toBe("show");
        });

        it("should accept retrigger command", () => {
            const cmd: Command = { cmd: "retrigger" };
            expect(cmd.cmd).toBe("retrigger");
        });

        it("should accept update_style command with partial style", () => {
            const cmd: Command = {
                cmd: "update_style",
                style: { fontSizePreset: "xl", alignment: "left" },
            };
            expect(cmd.cmd).toBe("update_style");
            expect(cmd.style?.fontSizePreset).toBe("xl");
            expect(cmd.style?.alignment).toBe("left");
        });

        it("should accept save_preset command with name", () => {
            const cmd: Command = { cmd: "save_preset", name: "My Preset" };
            expect(cmd.cmd).toBe("save_preset");
            expect(cmd.name).toBe("My Preset");
        });

        it("should accept apply_preset command with name", () => {
            const cmd: Command = { cmd: "apply_preset", name: "Stage" };
            expect(cmd.cmd).toBe("apply_preset");
            expect(cmd.name).toBe("Stage");
        });

        it("should accept reload_hymns command", () => {
            const cmd: Command = { cmd: "reload_hymns" };
            expect(cmd.cmd).toBe("reload_hymns");
        });
    });

    describe("CommandResult structure", () => {
        it("should create success result", () => {
            const result: CommandResult = {
                success: true,
                payload: { type: "state" },
            };
            expect(result.success).toBe(true);
            expect(result.payload).toEqual({ type: "state" });
        });

        it("should create error result", () => {
            const result: CommandResult = {
                success: false,
                error: "Hymn not found",
            };
            expect(result.success).toBe(false);
            expect(result.error).toBe("Hymn not found");
        });

        it("should allow both payload and error", () => {
            const result: CommandResult = {
                success: false,
                error: "Partial error",
                payload: { type: "partial" },
            };
            expect(result.success).toBe(false);
            expect(result.error).toBe("Partial error");
            expect(result.payload).toEqual({ type: "partial" });
        });
    });
});

describe("Command Processing Logic", () => {
    const createMockHandler = () => {
        const state = {
            currentHymn: "1",
            lines: ["Line 1", "Line 2", "Line 3"],
            lineIndex: 0,
            visible: true,
            lastError: "",
            style: { ...DEFAULT_STYLE },
        };

        return {
            state,
            handle: async (
                cmd: Command,
                readLines: (hymn: string) => Promise<string[]>
            ): Promise<CommandResult> => {
                state.lastError = "";

                switch (cmd.cmd) {
                    case "load":
                        if (!cmd.hymn) {
                            state.lastError = "Please enter a hymn number.";
                            return { success: false, error: state.lastError };
                        }
                        const lines = await readLines(cmd.hymn);
                        if (!lines.length) {
                            state.lastError = `Hymn ${cmd.hymn} was not found or is empty.`;
                            return { success: false, error: state.lastError };
                        }
                        state.currentHymn = cmd.hymn;
                        state.lines = lines;
                        state.lineIndex = 0;
                        state.visible = true;
                        return { success: true, payload: { type: "state" } };

                    case "next":
                        if (state.lineIndex < state.lines.length - 1) {
                            state.lineIndex++;
                        }
                        return { success: true, payload: { type: "state" } };

                    case "prev":
                        if (state.lineIndex > 0) {
                            state.lineIndex--;
                        }
                        return { success: true, payload: { type: "state" } };

                    case "reset":
                        state.lineIndex = 0;
                        state.visible = true;
                        return { success: true, payload: { type: "state" } };

                    case "blank":
                        state.visible = false;
                        return {
                            success: true,
                            payload: { type: "visibility" },
                        };

                    case "show":
                        state.visible = true;
                        return {
                            success: true,
                            payload: { type: "visibility" },
                        };

                    case "retrigger":
                        return {
                            success: true,
                            payload: { type: "retrigger" },
                        };

                    case "update_style":
                        if (typeof cmd.style !== "object" || !cmd.style) {
                            state.lastError =
                                "Style payload must be an object.";
                            return { success: false, error: state.lastError };
                        }
                        state.style = { ...state.style, ...cmd.style };
                        return { success: true, payload: { type: "style" } };

                    case "save_preset":
                        if (!cmd.name) {
                            state.lastError = "Please enter a preset name.";
                            return { success: false, error: state.lastError };
                        }
                        return {
                            success: true,
                            payload: { type: "save_preset", name: cmd.name },
                        };

                    case "apply_preset":
                        return {
                            success: true,
                            payload: { type: "apply_preset", name: cmd.name },
                        };

                    case "reload_hymns":
                        return {
                            success: true,
                            payload: { type: "reload_hymns" },
                        };

                    default:
                        state.lastError = `Unsupported command: ${cmd.cmd}`;
                        return { success: false, error: state.lastError };
                }
            },
        };
    };

    describe("load command", () => {
        it("should load valid hymn", async () => {
            const handler = createMockHandler();
            const result = await handler.handle(
                { cmd: "load", hymn: "1" },
                async () => ["Line 1", "Line 2"]
            );
            expect(result.success).toBe(true);
            expect(handler.state.currentHymn).toBe("1");
        });

        it("should reject empty hymn number", async () => {
            const handler = createMockHandler();
            const result = await handler.handle(
                { cmd: "load", hymn: "" },
                async () => []
            );
            expect(result.success).toBe(false);
            expect(result.error).toBe("Please enter a hymn number.");
        });

        it("should reject missing hymn", async () => {
            const handler = createMockHandler();
            const result = await handler.handle(
                { cmd: "load", hymn: "999" },
                async () => []
            );
            expect(result.success).toBe(false);
            expect(result.error).toContain("was not found");
        });
    });

    describe("navigation commands", () => {
        it("should move to next line", async () => {
            const handler = createMockHandler();
            handler.state.lineIndex = 0;
            const result = await handler.handle(
                { cmd: "next" },
                async () => []
            );
            expect(result.success).toBe(true);
            expect(handler.state.lineIndex).toBe(1);
        });

        it("should not exceed line count", async () => {
            const handler = createMockHandler();
            handler.state.lineIndex = 2; // Last line
            const result = await handler.handle(
                { cmd: "next" },
                async () => []
            );
            expect(result.success).toBe(true);
            expect(handler.state.lineIndex).toBe(2); // Stays at max
        });

        it("should move to previous line", async () => {
            const handler = createMockHandler();
            handler.state.lineIndex = 1;
            const result = await handler.handle(
                { cmd: "prev" },
                async () => []
            );
            expect(result.success).toBe(true);
            expect(handler.state.lineIndex).toBe(0);
        });

        it("should not go below zero", async () => {
            const handler = createMockHandler();
            handler.state.lineIndex = 0;
            const result = await handler.handle(
                { cmd: "prev" },
                async () => []
            );
            expect(result.success).toBe(true);
            expect(handler.state.lineIndex).toBe(0);
        });
    });

    describe("visibility commands", () => {
        it("should blank screen", async () => {
            const handler = createMockHandler();
            handler.state.visible = true;
            const result = await handler.handle(
                { cmd: "blank" },
                async () => []
            );
            expect(result.success).toBe(true);
            expect(handler.state.visible).toBe(false);
        });

        it("should show screen", async () => {
            const handler = createMockHandler();
            handler.state.visible = false;
            const result = await handler.handle(
                { cmd: "show" },
                async () => []
            );
            expect(result.success).toBe(true);
            expect(handler.state.visible).toBe(true);
        });

        it("should reset to line 0 and visible", async () => {
            const handler = createMockHandler();
            handler.state.lineIndex = 2;
            handler.state.visible = false;
            const result = await handler.handle(
                { cmd: "reset" },
                async () => []
            );
            expect(result.success).toBe(true);
            expect(handler.state.lineIndex).toBe(0);
            expect(handler.state.visible).toBe(true);
        });
    });

    describe("style commands", () => {
        it("should update style", async () => {
            const handler = createMockHandler();
            const result = await handler.handle(
                { cmd: "update_style", style: { fontSizePreset: "xl" } },
                async () => []
            );
            expect(result.success).toBe(true);
            expect(handler.state.style.fontSizePreset).toBe("xl");
        });

        it("should reject invalid style", async () => {
            const handler = createMockHandler();
            const result = await handler.handle(
                { cmd: "update_style", style: "invalid" as any },
                async () => []
            );
            expect(result.success).toBe(false);
        });

        it("should save preset with name", async () => {
            const handler = createMockHandler();
            const result = await handler.handle(
                { cmd: "save_preset", name: "MyPreset" },
                async () => []
            );
            expect(result.success).toBe(true);
            expect(result.payload).toEqual({
                type: "save_preset",
                name: "MyPreset",
            });
        });

        it("should reject preset without name", async () => {
            const handler = createMockHandler();
            const result = await handler.handle(
                { cmd: "save_preset", name: "" },
                async () => []
            );
            expect(result.success).toBe(false);
            expect(result.error).toBe("Please enter a preset name.");
        });
    });

    describe("unknown commands", () => {
        it("should reject unknown command", async () => {
            const handler = createMockHandler();
            const result = await handler.handle(
                { cmd: "unknown_cmd" },
                async () => []
            );
            expect(result.success).toBe(false);
            expect(result.error).toContain("Unsupported command");
        });
    });
});
