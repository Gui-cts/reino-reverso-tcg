import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("api/lib", { recursive: true });

await esbuild.build({
  entryPoints: ["src/net/server-entry.ts"],
  outfile: "api/lib/rr-server.mjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  external: ["@vercel/kv"],
  loader: {
    ".json": "json",
  },
});

console.log("api/lib/rr-server.mjs bundled");
