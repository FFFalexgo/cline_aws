import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		// Real Git and PowerShell processes can exceed five seconds on Windows CI.
		testTimeout: process.platform === "win32" ? 20_000 : 5_000,
		include: ["src/**/*.test.ts"],
		exclude: ["src/**/*.e2e.test.ts"],
	},
});
