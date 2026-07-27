import { describe, expect, it } from "vitest";
import {
	createBedrockCredentialProvider,
	createBedrockTransport,
	validateBedrockConnection,
} from "./bedrock-transport";

describe("Bedrock transport", () => {
	it("rejects invalid regions and non-HTTPS endpoints", () => {
		expect(() => validateBedrockConnection({ region: "not a region" })).toThrow(
			"BEDROCK_REGION",
		);
		expect(() =>
			validateBedrockConnection({
				region: "us-east-1",
				endpoint: "http://localhost:8080",
			}),
		).toThrow("BEDROCK_ENDPOINT");
		expect(() =>
			validateBedrockConnection({
				region: "us-east-1",
				controlPlaneEndpoint: "http://bedrock.us-east-1.amazonaws.com",
			}),
		).toThrow("BEDROCK_CONTROL_PLANE_ENDPOINT");
	});

	it("rejects Identity Center and service-mismatched AWS endpoints", () => {
		expect(() =>
			validateBedrockConnection({
				region: "us-east-1",
				endpoint:
					"https://identitycenter.amazonaws.com/ssoins-1234567890abcdef",
			}),
		).toThrow("must be a Bedrock Runtime endpoint");
		expect(() =>
			validateBedrockConnection({
				region: "us-east-1",
				controlPlaneEndpoint:
					"https://bedrock-runtime.us-east-1.amazonaws.com",
			}),
		).toThrow("must be a Bedrock control plane endpoint");
	});

	it("validates AWS endpoint regions and permits explicit non-AWS HTTPS origins", () => {
		expect(() =>
			validateBedrockConnection({
				region: "us-east-1",
				endpoint: "https://bedrock-runtime.us-west-2.amazonaws.com",
			}),
		).toThrow("endpoint region must match");
		expect(
			validateBedrockConnection({
				region: "us-east-1",
				endpoint: "https://bedrock-runtime.us-east-1.amazonaws.com",
				controlPlaneEndpoint:
					"https://vpce-0123456789abcdef0.bedrock.us-east-1.vpce.amazonaws.com",
			}),
		).toMatchObject({
			endpoint: "https://bedrock-runtime.us-east-1.amazonaws.com",
			controlPlaneEndpoint:
				"https://vpce-0123456789abcdef0.bedrock.us-east-1.vpce.amazonaws.com",
		});
		expect(
			validateBedrockConnection({
				region: "us-east-1",
				endpoint: "https://bedrock-runtime.corporate.example",
			}),
		).toMatchObject({
			endpoint: "https://bedrock-runtime.corporate.example",
		});
	});

	it("requires a workspace for relative CA paths", async () => {
		await expect(
			createBedrockTransport({
				region: "us-east-1",
				caBundlePath: "company-ca.pem",
			}),
		).rejects.toThrow("relative CA bundle path requires an open workspace");
	});

	it("uses an explicit in-memory credential provider before the default chain", async () => {
		const expected = {
			accessKeyId: "AKIATEST",
			secretAccessKey: "test-secret",
			sessionToken: "test-session",
		};
		const explicitProvider = async () => expected;
		const connection = validateBedrockConnection({
			region: "us-east-1",
			profile: "must-not-be-used",
			credentialProvider: explicitProvider,
			credentialSource: "access-key",
		});

		expect(connection.credentialProvider).toBe(explicitProvider);
		await expect(
			createBedrockCredentialProvider(connection, {})(),
		).resolves.toEqual(expected);
	});

	it("builds both AWS SDK and streaming transports from one CA bundle", async () => {
		const transport = await createBedrockTransport(
			{
				region: "us-east-1",
				caBundlePath: "src/test-fixtures/test-ca.pem",
			},
			process.cwd(),
		);
		try {
			expect(transport.ca).toContain("BEGIN CERTIFICATE");
			expect(transport.requestHandler).toBeDefined();
			expect(transport.fetch).not.toBe(globalThis.fetch);
		} finally {
			await transport.dispose();
		}
	});
});
