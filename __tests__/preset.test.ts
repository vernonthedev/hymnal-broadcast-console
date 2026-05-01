import { Preset, DEFAULT_PRESETS } from "../src/types/preset";
import { Style } from "../src/types/style";

describe("Preset Configuration", () => {
    describe("DEFAULT_PRESETS", () => {
        it("should have Default preset", () => {
            const preset = DEFAULT_PRESETS.Default;
            expect(preset).toBeDefined();
            expect(preset.name).toBe("Default");
            expect(preset.style.fontSizePreset).toBe("md");
            expect(preset.style.alignment).toBe("center");
            expect(preset.style.safeMargin).toBe(80);
            expect(preset.style.animation).toBe("pop");
            expect(preset.style.speakerLabel).toBe("");
        });

        it("should have Stage preset", () => {
            const preset = DEFAULT_PRESETS.Stage;
            expect(preset).toBeDefined();
            expect(preset.name).toBe("Stage");
            expect(preset.style.fontSizePreset).toBe("xl");
            expect(preset.style.alignment).toBe("center");
            expect(preset.style.safeMargin).toBe(120);
            expect(preset.style.animation).toBe("fade");
            expect(preset.style.speakerLabel).toBe("");
        });
    });

    describe("Preset type", () => {
        it("should accept valid preset", () => {
            const preset: Preset = {
                name: "Custom",
                style: {
                    fontSizePreset: "lg",
                    alignment: "left",
                    safeMargin: 100,
                    animation: "slide",
                    speakerLabel: "Test",
                },
            };
            expect(preset.name).toBe("Custom");
            expect(preset.style.fontSizePreset).toBe("lg");
        });

        it("should preserve style reference", () => {
            const style: Style = {
                fontSizePreset: "md",
                alignment: "center",
                safeMargin: 80,
                animation: "pop",
                speakerLabel: "Leader",
            };
            const preset: Preset = { name: "Test", style };
            expect(preset.style).toBe(style);
        });
    });

    describe("Preset to Style conversion", () => {
        it("should extract style from preset", () => {
            const preset = DEFAULT_PRESETS.Stage;
            const style = preset.style;
            expect(style.fontSizePreset).toBe("xl");
            expect(style.safeMargin).toBe(120);
        });

        it("should allow preset override", () => {
            const customPreset: Preset = {
                name: "Large",
                style: {
                    ...DEFAULT_PRESETS.Default.style,
                    fontSizePreset: "xxl",
                },
            };
            expect(customPreset.style.fontSizePreset).toBe("xxl");
            expect(customPreset.style.alignment).toBe("center"); // preserved
        });
    });
});

describe("Preset Management", () => {
    const createPresetManager = () => {
        const presets: Record<string, Preset> = { ...DEFAULT_PRESETS };

        return {
            presets,
            addPreset(name: string, style: Style): boolean {
                if (!name.trim()) return false;
                presets[name] = { name, style };
                return true;
            },
            removePreset(name: string): boolean {
                if (!presets[name]) return false;
                delete presets[name];
                return true;
            },
            getPreset(name: string): Preset | undefined {
                return presets[name];
            },
            applyPreset(name: string): Style | null {
                const preset = presets[name];
                return preset ? { ...preset.style } : null;
            },
            getPresetCount(): number {
                return Object.keys(presets).length;
            },
        };
    };

    describe("addPreset", () => {
        it("should add valid preset", () => {
            const manager = createPresetManager();
            const result = manager.addPreset("Custom", {
                fontSizePreset: "lg",
                alignment: "left",
                safeMargin: 90,
                animation: "slide",
                speakerLabel: "Test",
            });
            expect(result).toBe(true);
            expect(manager.getPresetCount()).toBe(3);
        });

        it("should reject empty name", () => {
            const manager = createPresetManager();
            const result = manager.addPreset("", {
                fontSizePreset: "lg",
                alignment: "left",
                safeMargin: 90,
                animation: "slide",
                speakerLabel: "Test",
            });
            expect(result).toBe(false);
            expect(manager.getPresetCount()).toBe(2);
        });

        it("should reject whitespace name", () => {
            const manager = createPresetManager();
            const result = manager.addPreset("   ", {
                fontSizePreset: "lg",
                alignment: "left",
                safeMargin: 90,
                animation: "slide",
                speakerLabel: "Test",
            });
            expect(result).toBe(false);
        });
    });

    describe("removePreset", () => {
        it("should remove existing preset", () => {
            const manager = createPresetManager();
            const result = manager.removePreset("Default");
            expect(result).toBe(true);
            expect(manager.getPreset("Default")).toBeUndefined();
            expect(manager.getPresetCount()).toBe(1);
        });

        it("should fail for non-existent preset", () => {
            const manager = createPresetManager();
            const result = manager.removePreset("NonExistent");
            expect(result).toBe(false);
        });
    });

    describe("applyPreset", () => {
        it("should apply Stage preset", () => {
            const manager = createPresetManager();
            const style = manager.applyPreset("Stage");
            expect(style).toBeDefined();
            expect(style?.fontSizePreset).toBe("xl");
        });

        it("should return null for missing preset", () => {
            const manager = createPresetManager();
            const style = manager.applyPreset("Missing");
            expect(style).toBeNull();
        });

        it("should create copy not reference", () => {
            const manager = createPresetManager();
            const style = manager.applyPreset("Default");
            if (style) {
                style.fontSizePreset = "xxl";
                const original = manager.getPreset("Default");
                expect(original?.style.fontSizePreset).toBe("md");
            }
        });
    });
});
