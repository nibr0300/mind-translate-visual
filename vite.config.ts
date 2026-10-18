import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { Plugin } from "vite";

// On phones the file picker backgrounds the tab and drops the live-update
// socket; Vite then reloads the page on reconnect, wiping the opened field
// and dialogs. Reconnect the socket instead of reloading (dev preview only).
const RELOAD_ON_RECONNECT = "await waitForSuccessfulPing(protocol, hostAndPath);\n      location.reload();";
function keepPageOnReconnect(): Plugin {
  return {
    name: "keep-page-on-reconnect",
    apply: "serve",
    enforce: "post",
    transform(code, id) {
      if (!id.includes("vite/dist/client/client.mjs") || !code.includes(RELOAD_ON_RECONNECT)) return null;
      return code.replace(
        RELOAD_ON_RECONNECT,
        "await waitForSuccessfulPing(protocol, hostAndPath);\n      console.log(\"[vite] reconnected without reload\");\n      socket = setupWebSocket(protocol, hostAndPath, onCloseWithoutOpen);"
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // The legacy component tagger injects refs into every function component,
  // flooding development with false React warnings and adding work to large maps.
  plugins: [react(), keepPageOnReconnect()],
  // Keep hooks and the renderer on one React instance, including UI dependencies
  // discovered after the preview has already loaded.
  optimizeDeps: {
    include: [
      "react", "react-dom", "react-dom/client", "react/jsx-runtime",
      "@radix-ui/react-dialog", "@radix-ui/react-select",
      "@radix-ui/react-slider", "@radix-ui/react-checkbox",
    ],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
