import { formatErrorDiagnostics, redactErrorDiagnostics } from "@bedrock-coder/shared"
import type { BedrockCoderMessage } from "@shared/ExtensionMessage"
import { memo } from "react"
import { BedrockCoderError } from "../../../../src/services/error/BedrockCoderError"
import { ErrorDetails } from "./ErrorDetails"

interface ErrorRowProps {
	message: BedrockCoderMessage
	errorType: "error" | "mistake_limit_reached" | "diff_error" | "bedrockCoderignore_error"
	apiRequestFailedMessage?: string
	apiReqStreamingFailedMessage?: string
}

const ErrorRow = memo(({ message, errorType, apiRequestFailedMessage, apiReqStreamingFailedMessage }: ErrorRowProps) => {
	if (errorType === "diff_error") {
		return (
			<div className="flex flex-col p-2 rounded text-xs opacity-80 bg-quote text-foreground">
				The model used search patterns that do not match the file. Retrying…
			</div>
		)
	}

	if (errorType === "bedrockCoderignore_error") {
		return (
			<div className="flex flex-col p-2 rounded text-xs opacity-80 bg-quote text-foreground">
				Bedrock Coder tried to access <code>{message.text}</code>, which is blocked by <code>.bedrock-coderignore</code>.
			</div>
		)
	}

	const rawError = apiRequestFailedMessage || apiReqStreamingFailedMessage || message.text || "Unknown error"
	const error = BedrockCoderError.parse(rawError)
	const errorMessage = redactErrorDiagnostics(error?._error.message || error?.message || rawError)
	const requestId = error?.requestId
	let detail = error?._error.details
	if (!detail) {
		try {
			const parsed = JSON.parse(rawError)
			if (parsed && typeof parsed === "object") detail = formatErrorDiagnostics(parsed)
		} catch {
			// Plain-text errors are already preserved in errorMessage.
		}
	}
	const fullError = [
		errorMessage,
		error?._error.code && `Error code: ${error._error.code}`,
		error?.providerId && `Provider: ${error.providerId}`,
		error?.modelId && `Model: ${error.modelId}`,
		error?.status && `HTTP status: ${error.status}`,
		requestId && `AWS request ID: ${requestId}`,
		detail && (typeof detail === "string" ? redactErrorDiagnostics(detail) : formatErrorDiagnostics({ details: detail })),
	]
		.filter(Boolean)
		.join("\n\n")
	const firstLine = errorMessage.split("\n")[0]
	const summary = firstLine.length > 300 ? `${firstLine.slice(0, 300)}…` : firstLine

	return (
		<div className="min-w-0">
			<p className="m-0 whitespace-pre-wrap text-error wrap-anywhere">
				{summary}
				{requestId && <span className="block">AWS request ID: {requestId}</span>}
			</p>
			<ErrorDetails details={fullError} />
		</div>
	)
})

export default ErrorRow
