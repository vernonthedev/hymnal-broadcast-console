import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use current working directory as project root
const projectRoot = process.cwd();

const sourceDir = path.join(projectRoot, "assets");
const outputDir = path.join(projectRoot, "assets/icons");

async function buildIcons() {
    console.log("Building application icons...");
    console.log(`Source directory: ${sourceDir}`);
    console.log(`Output directory: ${outputDir}`);

    try {
        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`  Created output directory: ${outputDir}`);
        }

        // Copy logo files to icons directory
        const filesToCopy = [
            { source: "logo-colored.png", dest: "app.png" },
            { source: "logo-transparent.png", dest: "app-transparent.png" },
            { source: "favicon.png", dest: "favicon.png" },
        ];

        for (const { source, dest } of filesToCopy) {
            const sourcePath = path.join(sourceDir, source);
            const destPath = path.join(outputDir, dest);

            if (fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, destPath);
                console.log(`  ✓ Copied ${source} -> ${dest}`);
            } else {
                console.warn(`  ⚠ Source file not found: ${sourcePath}`);
            }
        }

        // Create a simple ico file (Windows icon)
        // For now, we'll just copy the PNG as a placeholder
        // In production, you'd want to use a proper icon generation tool
        const icoPath = path.join(outputDir, "app.ico");
        if (fs.existsSync(path.join(sourceDir, "logo-colored.png"))) {
            fs.copyFileSync(path.join(sourceDir, "logo-colored.png"), icoPath);
            console.log(`  ✓ Created app.ico (placeholder)`);
        }

        // Create a simple icns file (macOS icon)
        // For now, we'll just copy the PNG as a placeholder
        const icnsPath = path.join(outputDir, "app.icns");
        if (fs.existsSync(path.join(sourceDir, "logo-colored.png"))) {
            fs.copyFileSync(path.join(sourceDir, "logo-colored.png"), icnsPath);
            console.log(`  ✓ Created app.icns (placeholder)`);
        }

        console.log("✓ Icons built successfully!");
        console.log(`  Output directory: ${outputDir}`);
        console.log(`  Generated files:`);

        // List generated files
        const files = fs.readdirSync(outputDir);
        files.forEach((file) => {
            console.log(`    - ${file}`);
        });

        console.log(
            "\nNote: For production builds, consider using proper icon generation tools"
        );
        console.log(
            "like 'electron-icon-builder' or 'png2icons' for .ico and .icns files."
        );
    } catch (error) {
        console.error("✗ Failed to build icons:", error);
        process.exit(1);
    }
}

buildIcons();
