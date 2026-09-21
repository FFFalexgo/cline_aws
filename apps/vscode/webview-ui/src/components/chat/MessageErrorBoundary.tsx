import { formatErrorDiagnostics } from "@bedrock-coder/shared"
import type { BedrockCoderMessage } from "@shared/ExtensionMessage"
import { Component, type ReactNode } from "react"
import { ErrorDetails } from "./ErrorDetails"

interface Props {
	children: ReactNode
	message: BedrockCoderMessage | BedrockCoderMessage[]
}

/** Isolate a rendering failure to one row and keep its original content readable. */
export class MessageErrorBoundary extends Component<Props, { error: Error | null }> {
	state: { error: Error | null } = { error: null }

	static getDerivedStateFromError(error: Error) {
		return { error }
	}

	render() {
		if (!this.state.error) return this.props.children
		const messages = Array.isArray(this.props.message) ? this.props.message : [this.props.message]
		return (
			<div className="min-w-0 px-4 py-2.5">
				<p className="m-0 mb-2 text-description text-xs">Formatting failed. Showing the original message.</p>
				{messages.map((message) => (
					<div key={message.ts}>
						<pre className="m-0 whitespace-pre-wrap wrap-anywhere font-sans select-text">{message.text}</pre>
						{message.images?.map((src) => (
							<img alt="Message attachment" className="max-w-full" key={src} src={src} />
						))}
						{message.files?.map((file) => (
							<p className="wrap-anywhere" key={file}>
								{file}
							</p>
						))}
					</div>
				))}
				<ErrorDetails details={formatErrorDiagnostics(this.state.error)} />
			</div>
		)
	}
}
