import { describe, expect, it } from "vitest"
import type { StateManager } from "@/core/storage/StateManager"
import { buildBedrockConnection, createStoredBedrockCredentialProvider, resolveAwsAuthMode } from "./bedrock-config"

function fakeStateManager(
	apiConfiguration: Record<string, unknown>,
	secrets: Record<string, string | undefined> = {},
): StateManager {
	return {
		getApiConfiguration: () => apiConfiguration,
		getSecretKey: (key: string) => secrets[key],
	} as unknown as StateManager
}

describe("Bedrock access-key configuration", () => {
	it("keeps existing profile configurations backward compatible", () => {
		const configuration = { awsRegion: "us-west-2", awsProfile: "engineering-sso" }
		expect(resolveAwsAuthMode(configuration)).toBe("profile")
		expect(buildBedrockConnection(configuration)).toMatchObject({
			region: "us-west-2",
			profile: "engineering-sso",
			credentialSource: "profile",
		})
	})

	it("creates an in-memory provider from the restricted secrets store", async () => {
		const stateManager = fakeStateManager(
			{ awsRegion: "us-east-1", awsAuthMode: "access-key" },
			{
				awsAccessKeyId: " AKIATEST ",
				awsSecretAccessKey: " test-secret ",
				awsSessionToken: " test-session ",
			},
		)
		const provider = createStoredBedrockCredentialProvider(stateManager)
		expect(provider).toBeDefined()
		await expect(provider?.()).resolves.toEqual({
			accessKeyId: "AKIATEST",
			secretAccessKey: "test-secret",
			sessionToken: "test-session",
		})
		expect(buildBedrockConnection(stateManager.getApiConfiguration(), provider)).toMatchObject({
			credentialProvider: provider,
			credentialSource: "access-key",
			profile: undefined,
		})
	})

	it("returns a clear setup error when access-key mode is incomplete", async () => {
		const stateManager = fakeStateManager({ awsAuthMode: "access-key" }, { awsAccessKeyId: "AKIATEST" })
		await expect(createStoredBedrockCredentialProvider(stateManager)?.()).rejects.toThrow("Enter and save")
	})

	it("ignores obsolete custom control-plane endpoints and uses the regional AWS catalog", () => {
		const connection = buildBedrockConnection({
			awsRegion: "us-east-1",
			awsBedrockEndpoint: "https://bedrock-runtime.us-east-1.amazonaws.com",
			awsBedrockControlPlaneEndpoint: "https://identitycenter.amazonaws.com/ssoins-stale",
		})

		expect(connection).toMatchObject({
			region: "us-east-1",
			endpoint: "https://bedrock-runtime.us-east-1.amazonaws.com",
		})
		expect(connection.controlPlaneEndpoint).toBeUndefined()
	})
})
