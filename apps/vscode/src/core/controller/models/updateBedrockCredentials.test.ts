import { describe, expect, it, vi } from "vitest"
import { updateBedrockCredentials } from "./updateBedrockCredentials"

function fakeController() {
	return {
		stateManager: {
			setSecretsBatch: vi.fn(),
			flushPendingState: vi.fn(async () => {}),
		},
		postStateToWebview: vi.fn(async () => {}),
		bedrockStartup: {
			connectionChanged: vi.fn(async () => {}),
		},
	}
}

describe("updateBedrockCredentials", () => {
	it("stores a complete trimmed credential set and restarts validation", async () => {
		const controller = fakeController()
		await updateBedrockCredentials(controller as never, {
			accessKeyId: " AKIATEST ",
			secretAccessKey: " secret ",
			sessionToken: " session ",
			clear: false,
		})

		expect(controller.stateManager.setSecretsBatch).toHaveBeenCalledWith({
			awsAccessKeyId: "AKIATEST",
			awsSecretAccessKey: "secret",
			awsSessionToken: "session",
		})
		expect(controller.stateManager.flushPendingState).toHaveBeenCalledOnce()
		expect(controller.postStateToWebview).toHaveBeenCalledOnce()
		expect(controller.bedrockStartup.connectionChanged).toHaveBeenCalledOnce()
	})

	it("clears all stored access-key fields", async () => {
		const controller = fakeController()
		await updateBedrockCredentials(controller as never, {
			accessKeyId: "",
			secretAccessKey: "",
			sessionToken: "",
			clear: true,
		})

		expect(controller.stateManager.setSecretsBatch).toHaveBeenCalledWith({
			awsAccessKeyId: undefined,
			awsSecretAccessKey: undefined,
			awsSessionToken: undefined,
		})
	})

	it("rejects incomplete credentials without writing", async () => {
		const controller = fakeController()
		await expect(
			updateBedrockCredentials(controller as never, {
				accessKeyId: "AKIATEST",
				secretAccessKey: "",
				sessionToken: "",
				clear: false,
			}),
		).rejects.toThrow("required")
		expect(controller.stateManager.setSecretsBatch).not.toHaveBeenCalled()
	})
})
