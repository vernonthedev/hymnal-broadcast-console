import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    root: path.resolve(__dirname, "src/ui/renderer"),
    base: "./",
    plugins: [react()],
    build: {
        outDir: path.resolve(__dirname, "src/ui/renderer/dist"),
        emptyOutDir: true,
        rollupOptions: {
            input: path.resolve(__dirname, "src/ui/renderer/index.html"),
        },
    },
    css: {
        postcss: path.resolve(__dirname, "postcss.config.js"),
    },
});
