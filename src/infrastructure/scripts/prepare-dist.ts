import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../../..");
const unpackedRoot = path
    .join(root, "dist", "electron", "win-unpacked")
    .toLowerCase();
const escapedUnpackedRoot = unpackedRoot.replace(/'/g, "''");

function getLatestChangelogVersion(): string | null {
    const changelogPath = path.join(root, "CHANGELOG.md");
    const content = fs.readFileSync(changelogPath, "utf-8");
    const match = content.match(/^## \[(\d+\.\d+\.\d+)\]/m);
    return match ? match[1] : null;
}

function syncVersionFromChangelog(): void {
    const version = getLatestChangelogVersion();
    if (!version) {
        console.warn(
            "Could not extract version from CHANGELOG.md, skipping version sync."
        );
        return;
    }

    const pkgPath = path.join(root, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

    if (pkg.version === version) {
        console.log(`Version ${version} is already up to date.`);
        return;
    }

    console.log(`Syncing package.json version: ${pkg.version} → ${version}`);
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + "\n");
}

function cleanupWindowsUnpackedProcesses(): void {
    if (process.platform !== "win32") {
        return;
    }

    const script = `
    $targets = Get-Process -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Path -and
        $_.Path.ToLower().StartsWith('${escapedUnpackedRoot}') -and
        ($_.ProcessName -eq 'server' -or $_.ProcessName -like 'Hymn Broadcast Console*')
      }
    foreach ($target in $targets) {
      Stop-Process -Id $target.Id -Force -ErrorAction SilentlyContinue
    }
  `;

    const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
        cwd: root,
        stdio: "inherit",
        shell: false,
    });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

syncVersionFromChangelog();
cleanupWindowsUnpackedProcesses();
