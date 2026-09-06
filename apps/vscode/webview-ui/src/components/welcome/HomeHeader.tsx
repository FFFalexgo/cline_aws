import BedrockCoderLogoVariable from "@/assets/BedrockCoderLogoVariable"
import { useExtensionState } from "@/context/ExtensionStateContext"

const HomeHeader = () => {
	const { environment } = useExtensionState()

	return (
		<div className="flex flex-col items-start gap-3 px-5 pt-7 pb-5">
			<div>
				<BedrockCoderLogoVariable className="size-8" environment={environment} />
			</div>
			<div className="flex flex-col gap-1">
				<h1 className="m-0 text-md font-medium">How can I help?</h1>
				<span className="text-xs text-description">Start a conversation or pick up where you left off.</span>
			</div>
		</div>
	)
}

export default HomeHeader
