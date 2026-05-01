import { existsSync, mkdirSync } from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../../..");
const outputDir = path.join(root, "assets", "icons");
const iconSource = path.join(root, "assets", "icon-source.png");
const iconGenCommand =
    process.platform === "win32"
        ? path.join(root, "node_modules", ".bin", "icon-gen.exe")
        : path.join(root, "node_modules", ".bin", "icon-gen");

mkdirSync(outputDir, { recursive: true });

function isPython312(command: string, isPyLauncher: boolean): boolean {
    const args = isPyLauncher ? ["-3.12", "--version"] : ["--version"];
    const result = spawnSync(command, args, {
        cwd: root,
        stdio: "pipe",
        shell: process.platform === "win32" && !command.includes(path.sep),
    });

    if (result.status !== 0) {
        return false;
    }

    const output = result.stdout?.toString() || result.stderr?.toString() || "";
    return output.includes("3.12");
}

function detectPython(): string {
    const candidates =
        process.platform === "win32"
            ? [path.join(root, "env", "Scripts", "python.exe"), "python", "py"]
            : [path.join(root, "env", "bin", "python"), "python3", "python"];

    for (const command of candidates) {
        if (command.includes(path.sep) && !existsSync(command)) {
            continue;
        }

        const isPyLauncher = command === "py";
        if (isPython312(command, isPyLauncher)) {
            return command;
        }
    }

    throw new Error(
        "Python 3.12 was not found. Install it or create the local env first."
    );
}

const python = detectPython();
const prepareArgs =
    python === "py"
        ? ["-3.12", "scripts/prepare-icon-source.py"]
        : ["scripts/prepare-icon-source.py"];

const prepareResult = spawnSync(python, prepareArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32" && !python.includes(path.sep),
});

if (prepareResult.status !== 0) {
    process.exit(prepareResult.status || 1);
}

const result = spawnSync(
    iconGenCommand,
    ["-i", iconSource, "-o", "assets/icons"],
    {
        cwd: root,
        stdio: "inherit",
        shell: false,
    }
);

if (result.status !== 0) {
    process.exit(result.status || 1);
}
