import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Everything is bundled locally: the app must work with no network (Capacitor serves dist/).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
    sourcemap: false,
  },
  worker: { format: "es" },
  server: { port: 5320 },
});
