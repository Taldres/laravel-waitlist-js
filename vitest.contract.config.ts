import { defineConfig } from "vitest/config";

// Runs against a live API: start it with `composer --working-dir=contract serve`.
export default defineConfig({
    test: {
        name: "contract",
        environment: "node",
        include: ["contract/**/*.test.ts"],
    },
});
