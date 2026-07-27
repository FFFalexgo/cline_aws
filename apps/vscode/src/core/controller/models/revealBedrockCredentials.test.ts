import { describe, expect, it } from "vitest"
import { revealBedrockCredentials } from "./revealBedrockCredentials"

describe("revealBedrockCredentials", () => {
	it("returns the saved values only to the explicit reveal request", async () => {
		const secrets: Record<string, string> = {
			awsAccessKeyId: "AKIATEST",
			awsSecretAccessKey: "secret-value",
			awsSessionToken: "session-value",
		}
		const controller = {
			stateManager: {
				getSecretKey: (key: string) => secrets[key],
			},
		}

		await expect(revealBedrockCredentials(controller as never, {})).resolves.toMatchObject({
			accessKeyId: "AKIATEST",
			secretAccessKey: "secret-value",
			sessionToken: "session-value",
		})
	})
})
