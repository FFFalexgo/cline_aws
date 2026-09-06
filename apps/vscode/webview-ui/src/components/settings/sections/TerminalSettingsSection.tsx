import { UpdateTerminalConnectionTimeoutResponse } from "@shared/proto/index.bedrock_coder"
import React, { useState } from "react"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { PlatformType } from "@/config/platform.config"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { usePlatform } from "@/context/PlatformContext"
import { StateServiceClient } from "../../../services/grpc-client"
import Section from "../Section"
import { updateSetting } from "../utils/settingsHandlers"

interface TerminalSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const TerminalSettingsSection: React.FC<TerminalSettingsSectionProps> = ({ renderSectionHeader }) => {
	const {
		shellIntegrationTimeout,
		terminalReuseEnabled,
		defaultTerminalProfile,
		availableTerminalProfiles,
		vscodeTerminalExecutionMode,
	} = useExtensionState()
	const platformConfig = usePlatform()
	const isVsCodePlatform = platformConfig.type === PlatformType.VSCODE
	const executionMode = vscodeTerminalExecutionMode ?? "backgroundExec"
	const isBackgroundExec = executionMode === "backgroundExec"

	const [inputValue, setInputValue] = useState((shellIntegrationTimeout / 1000).toString())
	const [inputError, setInputError] = useState<string | null>(null)

	const handleTimeoutChange = (value: string) => {
		setInputValue(value)

		const seconds = Number.parseFloat(value)
		if (Number.isNaN(seconds) || seconds <= 0) {
			setInputError("Please enter a positive number")
			return
		}

		setInputError(null)
		const timeoutMs = Math.round(seconds * 1000)

		StateServiceClient.updateTerminalConnectionTimeout({ timeoutMs })
			.then((response: UpdateTerminalConnectionTimeoutResponse) => {
				const timeoutMs = response.timeoutMs
				// Backend calls postStateToWebview(), so state will update via subscription
				// Just sync the input value with the confirmed backend value
				if (timeoutMs !== undefined) {
					setInputValue((timeoutMs / 1000).toString())
				}
			})
			.catch((error) => {
				console.error("Failed to update terminal connection timeout:", error)
			})
	}

	const handleInputBlur = () => {
		if (inputError) {
			setInputValue((shellIntegrationTimeout / 1000).toString())
			setInputError(null)
		}
	}

	return (
		<div>
			{renderSectionHeader("terminal")}
			<Section>
				<FieldGroup id="terminal-settings-section">
					{isVsCodePlatform && (
						<Field>
							<FieldLabel htmlFor="terminal-execution-mode">Terminal Execution Mode</FieldLabel>
							<Select
								onValueChange={(value) =>
									updateSetting(
										"vscodeTerminalExecutionMode",
										value === "backgroundExec" ? "backgroundExec" : "vscodeTerminal",
									)
								}
								value={executionMode}>
								<SelectTrigger
									aria-describedby="execution-mode-description"
									className="w-full"
									id="terminal-execution-mode">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="vscodeTerminal">VS Code Terminal</SelectItem>
										<SelectItem value="backgroundExec">Background Exec</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							<FieldDescription id="execution-mode-description">
								Run commands in the VS Code terminal or a background process.
							</FieldDescription>
						</Field>
					)}
					{isVsCodePlatform && !isBackgroundExec && (
						<>
							<Field data-invalid={Boolean(inputError)}>
								<FieldLabel htmlFor="shell-timeout">Shell integration timeout (seconds)</FieldLabel>
								<Input
									aria-describedby={inputError ? "shell-timeout-error" : "shell-timeout-description"}
									aria-invalid={Boolean(inputError)}
									id="shell-timeout"
									inputMode="decimal"
									onBlur={handleInputBlur}
									onChange={(event) => handleTimeoutChange(event.target.value)}
									value={inputValue}
								/>
								{inputError && (
									<p className="m-0 text-sm text-error" id="shell-timeout-error" role="alert">
										{inputError}
									</p>
								)}
								<FieldDescription id="shell-timeout-description">
									How long to wait for shell integration. Increase this if terminal connections time out.
								</FieldDescription>
							</Field>
							<div className="flex items-start gap-3">
								<Field className="flex-1">
									<FieldLabel htmlFor="terminal-reuse">Enable aggressive terminal reuse</FieldLabel>
									<FieldDescription id="terminal-reuse-description">
										Reuse terminal windows outside the current working directory. Disable if terminal commands
										cause task lockout.
									</FieldDescription>
								</Field>
								<Switch
									aria-describedby="terminal-reuse-description"
									checked={terminalReuseEnabled ?? true}
									className="mt-0.5"
									id="terminal-reuse"
									onCheckedChange={(checked) => updateSetting("terminalReuseEnabled", checked)}
								/>
							</div>
						</>
					)}
					<Field>
						<FieldLabel htmlFor="default-terminal-profile">Default Terminal Profile</FieldLabel>
						<Select
							onValueChange={(value) => updateSetting("defaultTerminalProfile", value)}
							value={defaultTerminalProfile || "default"}>
							<SelectTrigger
								aria-describedby="terminal-profile-description"
								className="w-full"
								id="default-terminal-profile">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{!availableTerminalProfiles.some((profile) => profile.id === "default") && (
										<SelectItem value="default">Default</SelectItem>
									)}
									{availableTerminalProfiles.map((profile) => (
										<SelectItem key={profile.id} title={profile.description} value={profile.id}>
											{profile.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<FieldDescription id="terminal-profile-description">
							Default uses your VS Code terminal setting.
						</FieldDescription>
					</Field>
					<a
						className="text-sm"
						href="https://github.com/FFFalexgo/AWS_Bedrock_Coder#readme"
						rel="noopener noreferrer"
						target="_blank">
						Terminal troubleshooting
					</a>
				</FieldGroup>
			</Section>
		</div>
	)
}
export default TerminalSettingsSection
