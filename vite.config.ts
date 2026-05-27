import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      devOptions: { enabled: false, type: "module" },
      manifest: {
        name: "Resultadismo",
        short_name: "Resultadismo",
        description: "O jogo de palpites de futebol. Crave o placar, suba na classificação.",
        lang: "pt-BR",
        theme_color: "#1CB19C",
        background_color: "#ececed",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/favicon/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/favicon/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/favicon/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
