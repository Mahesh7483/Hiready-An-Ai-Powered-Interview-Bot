import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors into cacheable chunks so the main bundle stays small.
        // TensorFlow (proctoring) is by far the largest — it only loads when a
        // proctored page (assessment/voice interview) is visited.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@tensorflow")) return "vendor-tensorflow";
          if (id.includes("firebase")) return "vendor-firebase";
          if (id.includes("pdfjs-dist") || id.includes("mammoth")) return "vendor-docs";
          if (id.includes("@deepgram")) return "vendor-deepgram";
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) {
            return "vendor-charts";
          }
          return undefined;
        },
      },
    },
  },
}));
