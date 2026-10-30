// The XP machine builds into the room's web folder and is served from /pc/.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/pc/",
  plugins: [react()],
  build: {
    outDir: "../web/pc",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
