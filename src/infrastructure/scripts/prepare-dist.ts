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

cleanupWindowsUnpackedProcesses();
