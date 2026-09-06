import Section from "../Section"

interface AboutSectionProps {
	version: string
	renderSectionHeader: (tabId: string) => JSX.Element | null
}
const AboutSection = ({ version, renderSectionHeader }: AboutSectionProps) => (
	<div>
		{renderSectionHeader("about")}
		<Section>
			<div className="flex flex-col gap-1 text-sm text-description">
				<p className="m-0 font-medium text-foreground">Bedrock Coder v{version}</p>
				<p className="m-0">A local-first coding agent for VS Code powered by Amazon Bedrock.</p>
				<div className="flex flex-wrap gap-3">
					<a href="https://github.com/FFFalexgo/AWS_Bedrock_Coder">GitHub</a>
					<a href="https://github.com/FFFalexgo/AWS_Bedrock_Coder/issues">Issues</a>
					<a href="https://github.com/FFFalexgo/AWS_Bedrock_Coder#readme">Documentation</a>
				</div>
			</div>
		</Section>
	</div>
)
export default AboutSection
