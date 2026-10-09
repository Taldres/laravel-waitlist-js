import { defineConfig } from "tsdown";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        "next/index": "src/next/index.ts",
    },
    format: "esm",
    platform: "neutral",
    target: "es2022",
    dts: true,
    sourcemap: true,
    clean: true,
    fixedExtension: false,
    deps: {
        neverBundle: ["next", /^next\//, "server-only"],
    },
});
