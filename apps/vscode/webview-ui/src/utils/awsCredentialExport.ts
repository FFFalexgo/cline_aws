export interface ParsedAwsCredentials {
	accessKeyId: string
	secretAccessKey: string
	sessionToken?: string
}

const SUPPORTED_NAMES = new Set(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"])

function parseExportValue(rawValue: string, name: string): string {
	let value = rawValue.trim()
	if (value.endsWith(";")) value = value.slice(0, -1).trim()
	if (!value) throw new Error(`${name} has no value.`)

	const quote = value[0]
	if (quote === "'" || quote === '"') {
		if (value.length < 2 || value.at(-1) !== quote) {
			throw new Error(`${name} has an unmatched quote.`)
		}
		value = value.slice(1, -1)
	}
	if (!value) throw new Error(`${name} has no value.`)
	return value
}

export function parseAwsCredentialExports(input: string): ParsedAwsCredentials {
	const values = new Map<string, string>()
	for (const line of input.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue

		const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
		if (!match) throw new Error("Each credential line must use export NAME=value.")
		const [, name, rawValue] = match
		if (!SUPPORTED_NAMES.has(name)) continue
		if (values.has(name)) throw new Error(`${name} appears more than once.`)
		values.set(name, parseExportValue(rawValue, name))
	}

	const accessKeyId = values.get("AWS_ACCESS_KEY_ID")
	const secretAccessKey = values.get("AWS_SECRET_ACCESS_KEY")
	if (!accessKeyId || !secretAccessKey) {
		throw new Error("The pasted block must include AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.")
	}

	const sessionToken = values.get("AWS_SESSION_TOKEN")
	return {
		accessKeyId,
		secretAccessKey,
		...(sessionToken ? { sessionToken } : {}),
	}
}
