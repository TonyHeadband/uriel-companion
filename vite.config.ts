import { resolve } from "node:path";
import { defineConfig } from "vite";

// Tauri expects a fixed dev port; 1420 is its convention and is in the gateway's CORS list.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        preview: resolve(__dirname, "preview.html"),
        settings: resolve(__dirname, "settings.html"),
      },
    },
  },
});
