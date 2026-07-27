import { describe, expect, it } from "vitest"
import { parseAwsCredentialExports } from "../awsCredentialExport"

describe("parseAwsCredentialExports", () => {
	it("parses the standard three-line AWS export block", () => {
		expect(
			parseAwsCredentialExports(`export AWS_ACCESS_KEY_ID=AKIATEST
export AWS_SECRET_ACCESS_KEY=test-secret
export AWS_SESSION_TOKEN=test-session`),
		).toEqual({
			accessKeyId: "AKIATEST",
			secretAccessKey: "test-secret",
			sessionToken: "test-session",
		})
	})

	it("supports quoted values, CRLF, semicolons, and unrelated AWS variables", () => {
		expect(
			parseAwsCredentialExports(
				'export AWS_REGION="us-east-1";\r\nexport AWS_ACCESS_KEY_ID="AKIATEST";\r\nexport AWS_SECRET_ACCESS_KEY=\'test-secret\';\r\nexport AWS_SESSION_TOKEN="test-session";',
			),
		).toEqual({
			accessKeyId: "AKIATEST",
			secretAccessKey: "test-secret",
			sessionToken: "test-session",
		})
	})

	it("allows long-term credentials without a session token", () => {
		expect(
			parseAwsCredentialExports(`AWS_ACCESS_KEY_ID=AKIATEST
AWS_SECRET_ACCESS_KEY=test-secret`),
		).toEqual({
			accessKeyId: "AKIATEST",
			secretAccessKey: "test-secret",
		})
	})

	it("rejects a block missing a required credential", () => {
		expect(() => parseAwsCredentialExports("export AWS_SESSION_TOKEN=test-session")).toThrow(
			"must include AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY",
		)
	})

	it("rejects duplicate credential variables", () => {
		expect(() =>
			parseAwsCredentialExports(`export AWS_ACCESS_KEY_ID=first
export AWS_ACCESS_KEY_ID=second
export AWS_SECRET_ACCESS_KEY=test-secret`),
		).toThrow("appears more than once")
	})
})
