import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    ...(process.env.SKIP_PWA
      ? []
      : [
          VitePWA({
            registerType: "autoUpdate",
            manifest: false,
          }),
        ]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8788",
    },
  },
});
