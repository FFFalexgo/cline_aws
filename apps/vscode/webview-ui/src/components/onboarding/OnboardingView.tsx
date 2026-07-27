import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { StateServiceClient } from "@/services/grpc-client"

const OnboardingView = () => {
	const finish = async () => {
		await StateServiceClient.setWelcomeViewCompleted({ value: true })
	}

	return (
		<main className="flex h-screen items-center justify-center p-6">
			<section className="flex max-w-lg flex-col gap-4 rounded border border-(--vscode-panel-border) p-6">
				<h1 className="m-0 text-xl">AWS Bedrock Coder</h1>
				<p className="m-0 text-(--vscode-descriptionForeground)">
					Inference runs only through AWS Bedrock. Configure a region, then choose environment/IAM-role credentials, an
					AWS profile/SSO session, or access keys saved in the extension's restricted local secrets store.
				</p>
				<VSCodeButton onClick={() => void finish()}>Get started</VSCodeButton>
			</section>
		</main>
	)
}

export default OnboardingView
