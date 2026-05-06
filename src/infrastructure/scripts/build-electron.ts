import * as esbuild from "esbuild";
import * as path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../../..");

async function build() {
    // Compile main.ts to CJS for Electron
    await esbuild.build({
        entryPoints: [path.join(root, "src/infrastructure/electron/main.ts")],
        bundle: true,
        platform: "node",
        target: "node18",
        outfile: path.join(root, "src/infrastructure/electron/main.cjs"),
        format: "cjs",
        external: ["electron"],
        define: {
            "import.meta.url": "undefined",
        },
    });

    // Compile preload.ts to CJS
    await esbuild.build({
        entryPoints: [
            path.join(root, "src/infrastructure/electron/preload.ts"),
        ],
        bundle: true,
        platform: "node",
        target: "node18",
        outfile: path.join(root, "src/infrastructure/electron/preload.cjs"),
        format: "cjs",
        external: ["electron"],
    });

    // Build renderer UI with Vite
    execSync("npx vite build --config vite.renderer.config.ts", {
        cwd: root,
        stdio: "inherit",
    });

    // Compile overlay-client.ts to IIFE
    await esbuild.build({
        entryPoints: [path.join(root, "assets/overlay-client.ts")],
        bundle: true,
        target: "es2020",
        outfile: path.join(root, "assets/overlay-client.js"),
        format: "iife",
    });

    console.log(
        "Built main.js, preload.cjs, renderer (Vite), and overlay-client.js"
    );
}

build();
