import { existsSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../../..");

const requiredFiles = [
    {
        path: path.join(root, "assets", "logo.png"),
        message: "Missing source logo at assets/logo.png.",
    },
    {
        path: path.join(root, "assets", "icons", "app.ico"),
        message:
            "Missing generated Windows icon at assets/icons/app.ico. Run `bun run build:icons`.",
    },
    {
        path: path.join(root, "assets", "icons", "app.icns"),
        message:
            "Missing generated macOS icon at assets/icons/app.icns. Run `bun run build:icons`.",
    },
    {
        path: path.join(root, "assets", "icons", "app.png"),
        message:
            "Missing generated Linux icon at assets/icons/app.png. Run `bun run build:icons`.",
    },
];

const missing = requiredFiles.filter((entry) => !existsSync(entry.path));

if (missing.length > 0) {
    console.error("Build asset preflight failed:\n");
    for (const entry of missing) {
        console.error(`- ${entry.message}`);
    }
    process.exit(1);
}

console.log("Build asset preflight passed.");
