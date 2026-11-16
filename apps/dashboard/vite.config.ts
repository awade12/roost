import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = "http://localhost:8787";

// Vite requires a default export. The proxy makes dev match prod, where Caddy
// serves the dashboard and the API from one origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/admin": api, "/v1": api, "/health": api } },
});
