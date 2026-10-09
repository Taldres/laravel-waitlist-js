import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: ["src/index.ts", "src/types.ts"],
            thresholds: {
                lines: 100,
                functions: 100,
                branches: 100,
                statements: 100,
            },
        },
        projects: [
            {
                extends: true,
                test: {
                    name: "node",
                    environment: "node",
                    include: ["tests/**/*.test.ts"],
                    typecheck: {
                        enabled: true,
                        include: ["tests/**/*.test-d.ts"],
                    },
                },
            },
            {
                extends: true,
                test: {
                    name: "edge",
                    environment: "edge-runtime",
                    include: ["tests/**/*.test.ts"],
                    exclude: ["tests/next/**"],
                },
            },
        ],
    },
});
