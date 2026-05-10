import { defineConfig } from "vite";
import path from "path";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const BUILD_ID = (() => {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    return `${sha}-${Date.now()}`;
  } catch {
    return `dev-${Date.now()}`;
  }
})();

function emitVersionPlugin() {
  return {
    name: "emit-version-txt",
    apply: "build" as const,
    closeBundle() {
      const out = resolve(__dirname, "dist");
      mkdirSync(out, { recursive: true });
      writeFileSync(resolve(out, "version.txt"), BUILD_ID + "\n");
    },
  };
}


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    emitVersionPlugin(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    port: 5173,
    strictPort: true,
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ["**/*.svg", "**/*.csv"],
});