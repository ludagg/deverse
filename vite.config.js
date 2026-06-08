import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// DEVERSE — Vite + React. The world-atlas country geometry is bundled at build
// time (imported JSON), so the globe's real outlines render with no network call.
export default defineConfig({
  plugins: [react()],
});
