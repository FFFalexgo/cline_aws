import { UpdateSettingsRequest } from "@shared/proto/bedrock_coder/state"
import { memo, type ReactNode } from "react"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useExtensionState } from "@/context/ExtensionStateContext"
import Section from "../Section"
import { updateSetting } from "../utils/settingsHandlers"

// Reusable checkbox component for feature settings
interface FeatureCheckboxProps {
	checked: boolean | undefined
	onChange: (checked: boolean) => void
	label: string
	description: ReactNode
	disabled?: boolean
}

// Interface for feature toggle configuration
interface FeatureToggle {
	id: string
	label: string
	description: ReactNode
	settingKey: keyof UpdateSettingsRequest
	stateKey: string
}

const agentFeatures: FeatureToggle[] = [
	{
		id: "auto-compact",
		label: "Auto Compact",
		description: "Automatically compress conversation history.",
		stateKey: "useAutoCondense",
		settingKey: "useAutoCondense",
	},
]

const editorFeatures: FeatureToggle[] = [
	{
		id: "show-feature-tips",
		label: "Feature Tips",
		description: "Show rotating tips during the thinking phase to help you discover Bedrock Coder features.",
		stateKey: "showFeatureTips",
		settingKey: "showFeatureTips",
	},
	{
		id: "checkpoints",
		label: "Checkpoints",
		description: "Save progress at key points for easy rollback",
		stateKey: "enableCheckpointsSetting",
		settingKey: "enableCheckpointsSetting",
	},
	{
		id: "worktrees",
		label: "Worktrees",
		description: "Enables git worktree management for running parallel Bedrock Coder tasks.",
		stateKey: "worktreesEnabled",
		settingKey: "worktreesEnabled",
	},
]

const advancedFeatures: FeatureToggle[] = [
	{
		id: "hooks",
		label: "Hooks",
		description: "Enable lifecycle and tool hooks during task execution.",
		stateKey: "hooksEnabled",
		settingKey: "hooksEnabled",
	},
]

const FeatureRow = memo(({ checked = false, onChange, label, description, disabled }: FeatureCheckboxProps) => (
	<div className="flex items-start justify-between gap-3 py-2">
		<div className="flex min-w-0 flex-1 flex-col gap-1">
			<label className="cursor-pointer" htmlFor={label}>
				{label}
			</label>
			<FieldDescription id={label + "-description"}>{description}</FieldDescription>
		</div>
		<Switch
			aria-describedby={label + "-description"}
			checked={checked}
			className="mt-0.5"
			disabled={disabled}
			id={label}
			onCheckedChange={onChange}
		/>
	</div>
))

interface FeatureSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const FeatureSettingsSection = ({ renderSectionHeader }: FeatureSettingsSectionProps) => {
	const {
		enableCheckpointsSetting,
		hooksEnabled,
		mcpDisplayMode,
		useAutoCondense,
		compactionStrategy,
		subagentsEnabled,
		worktreesEnabled,
		showFeatureTips,
	} = useExtensionState()

	// State lookup for mapped features
	const featureState: Record<string, boolean | undefined> = {
		showFeatureTips,
		enableCheckpointsSetting,
		hooksEnabled,
		useAutoCondense,
		subagentsEnabled,
		worktreesEnabled,
	}

	return (
		<div>
			{renderSectionHeader("features")}
			<Section>
				<FieldGroup>
					<div id="agent-features">
						{agentFeatures.map((feature) => (
							<FeatureRow
								checked={featureState[feature.stateKey]}
								description={feature.description}
								key={feature.id}
								label={feature.label}
								onChange={(checked) => updateSetting(feature.settingKey, checked)}
							/>
						))}
						<Field data-disabled={!useAutoCondense}>
							<FieldLabel htmlFor="compaction-strategy">Auto Compact Strategy</FieldLabel>
							<Select
								disabled={!useAutoCondense}
								onValueChange={(value) => updateSetting("compactionStrategy", value)}
								value={compactionStrategy ?? "agentic"}>
								<SelectTrigger
									aria-describedby="compaction-description"
									className="w-full"
									id="compaction-strategy">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="basic">Basic</SelectItem>
										<SelectItem value="agentic">Agentic</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							<FieldDescription id="compaction-description">
								Controls how auto compaction rewrites context.
							</FieldDescription>
						</Field>
					</div>
					<div id="optional-features">
						{editorFeatures.map((feature) => (
							<FeatureRow
								checked={featureState[feature.stateKey]}
								description={feature.description}
								key={feature.id}
								label={feature.label}
								onChange={(checked) => updateSetting(feature.settingKey, checked)}
							/>
						))}
					</div>
					<div id="advanced-features">
						{advancedFeatures.map((feature) => (
							<FeatureRow
								checked={featureState[feature.stateKey]}
								description={feature.description}
								key={feature.id}
								label={feature.label}
								onChange={(checked) => updateSetting(feature.settingKey, checked)}
							/>
						))}
						<Field>
							<FieldLabel htmlFor="mcp-display-mode">MCP Display Mode</FieldLabel>
							<Select onValueChange={(value) => updateSetting("mcpDisplayMode", value)} value={mcpDisplayMode}>
								<SelectTrigger
									aria-describedby="mcp-display-description"
									className="w-full"
									id="mcp-display-mode">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="plain">Plain Text</SelectItem>
										<SelectItem value="rich">Rich Display</SelectItem>
										<SelectItem value="markdown">Markdown</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							<FieldDescription id="mcp-display-description">
								Controls how MCP responses are displayed.
							</FieldDescription>
						</Field>
					</div>
				</FieldGroup>
			</Section>
		</div>
	)
}
export default memo(FeatureSettingsSection)
