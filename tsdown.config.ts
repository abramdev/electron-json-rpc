import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/main.ts",
    "src/preload.ts",
    "src/renderer/index.ts",
    "src/renderer/client.ts",
    "src/renderer/builder.ts",
    "src/renderer/event.ts",
    "src/stream.ts",
    "src/event.ts",
    "src/debug.ts",
  ],
  format: "esm",
  dts: true,
  clean: true,
});
