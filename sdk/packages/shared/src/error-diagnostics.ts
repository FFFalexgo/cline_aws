const SECRET_KEY =
	/^(?:authorization|proxy-authorization|cookie|set-cookie|(?:aws[_-]?)?(?:access[_-]?key[_-]?id|secret[_-]?access[_-]?key|session[_-]?token)|x-amz-security-token|api[_-]?key|password|secret|token)$/i;

/** Redact credential values without truncating the diagnostic text. */
export function redactErrorDiagnostics(text: string): string {
	return text
		.replace(
			/("(?:authorization|proxy-authorization|cookie|set-cookie|(?:aws[_-]?)?(?:access[_-]?key[_-]?id|secret[_-]?access[_-]?key|session[_-]?token)|x-amz-security-token|api[_-]?key|password|secret|token)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
			'$1"[REDACTED]"',
		)
		.replace(/\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g, "[REDACTED_AWS_ACCESS_KEY]")
		.replace(
			/\b((?:aws[_-]?)?(?:access[_-]?key[_-]?id|secret[_-]?access[_-]?key|session[_-]?token)|x-amz-security-token|api[_-]?key|password|secret)\s*[:=]\s*[^\s,;]+/gi,
			"$1=[REDACTED]",
		)
		.replace(
			/\b(authorization|proxy-authorization)\s*[:=]\s*[^\r\n]+/gi,
			"$1: [REDACTED]",
		)
		.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
		.replace(
			/([?&][^=&]*(?:key|secret|password|auth|signature|token|credential)[^=&]*=)[^&\s"]+/gi,
			"$1[REDACTED]",
		)
		.replace(
			/\barn:aws(?:-[a-z]+)?:sts::\d{12}:[^"\s,;]+/gi,
			"[REDACTED_STS_IDENTITY]",
		);
}

const ERROR_FIELDS = [
	"name",
	"message",
	"code",
	"status",
	"statusCode",
	"requestId",
	"request_id",
	"$metadata",
	"cause",
	"errors",
	"issues",
	"path",
	"expected",
	"received",
	"value",
	"context",
	"responseBody",
	"details",
	"stack",
] as const;

/** Preserve error causes and validation payloads, excluding request credentials. */
export function formatErrorDiagnostics(error: unknown): string {
	const ancestors = new Set<object>();
	const visit = (value: unknown, errorFieldsOnly = false): unknown => {
		if (typeof value === "string") return redactErrorDiagnostics(value);
		if (typeof value === "bigint") return String(value);
		if (!value || typeof value !== "object") return value;
		if (ancestors.has(value)) return "[Circular]";
		ancestors.add(value);
		try {
			if (Array.isArray(value)) return value.map((item) => visit(item));
			const record = value as Record<string, unknown>;
			const keys =
				errorFieldsOnly || value instanceof Error
					? ERROR_FIELDS
					: Object.keys(record);
			return Object.fromEntries(
				keys
					.filter((key) => record[key] !== undefined)
					.map((key) => [
						key,
						SECRET_KEY.test(key)
							? "[REDACTED]"
							: visit(record[key], key === "cause"),
					]),
			);
		} finally {
			ancestors.delete(value);
		}
	};
	if (typeof error === "string") return redactErrorDiagnostics(error);
	try {
		return JSON.stringify(visit(error, true), null, 2) ?? String(error);
	} catch {
		return redactErrorDiagnostics(String(error));
	}
}
