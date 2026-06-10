import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// DEVERSE — Vite + React. The world-atlas country geometry is bundled at build
// time (imported JSON), so the globe's real outlines render with no network call.
//
// In production the serverless function in /api runs on Vercel. The dev plugin
// below wires the same handler into `npm run dev`, so the OAuth flow works
// end-to-end locally (it reads GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET from .env).
function devApi(env) {
  return {
    name: "deverse-dev-api",
    apply: "serve",
    configureServer(server) {
      // expose the .env secrets to the Node handler (it reads process.env).
      // Only set when present — assigning undefined would coerce to "undefined".
      if (env.GITHUB_CLIENT_ID && !process.env.GITHUB_CLIENT_ID) process.env.GITHUB_CLIENT_ID = env.GITHUB_CLIENT_ID;
      if (env.GITHUB_CLIENT_SECRET && !process.env.GITHUB_CLIENT_SECRET) process.env.GITHUB_CLIENT_SECRET = env.GITHUB_CLIENT_SECRET;
      if (env.DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;
      const route = (path, file) =>
        server.middlewares.use(path, async (req, res, next) => {
          try {
            const mod = await server.ssrLoadModule(file);
            await mod.default(req, res);
          } catch (e) {
            next(e);
          }
        });
      route("/api/github-callback", "/api/github-callback.js");
      route("/api/developers", "/api/developers.js");
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), devApi(env)],
  };
});
