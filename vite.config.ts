import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

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
  plugins: [react()],
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
