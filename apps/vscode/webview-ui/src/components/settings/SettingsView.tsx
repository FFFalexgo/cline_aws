import type { ExtensionMessage } from "@shared/ExtensionMessage"
import { ResetStateRequest } from "@shared/proto/bedrock_coder/state"
import { useCallback, useEffect, useState } from "react"
import { useEvent } from "react-use"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { cn } from "@/lib/utils"
import { StateServiceClient } from "@/services/grpc-client"
import { Tab, TabContent, TabList, TabTrigger } from "../common/Tab"
import ViewHeader from "../common/ViewHeader"
import SectionHeader from "./SectionHeader"
import AboutSection from "./sections/AboutSection"
import ApiConfigurationSection from "./sections/ApiConfigurationSection"
import DebugSection from "./sections/DebugSection"
import FeatureSettingsSection from "./sections/FeatureSettingsSection"
import GeneralSettingsSection from "./sections/GeneralSettingsSection"
import TerminalSettingsSection from "./sections/TerminalSettingsSection"

const SETTINGS_TABS = [
	{ id: "api-config", name: "API Configuration" },
	{ id: "general", name: "General" },
] as const
const sectionTitles: Record<string, string> = {
	general: "Language",
	features: "Features",
	terminal: "Terminal",
	about: "About",
	debug: "Developer tools",
}
const renderSectionHeader = (id: string) => <SectionHeader>{sectionTitles[id]}</SectionHeader>
const tabForSection = (section?: string) => (!section || section === "api-config" ? "api-config" : "general")

type SettingsViewProps = { onDone: () => void; targetSection?: string }
const SettingsView = ({ onDone, targetSection }: SettingsViewProps) => {
	const { version, environment, settingsInitialModelTab } = useExtensionState()
	const [activeTab, setActiveTab] = useState(tabForSection(targetSection))
	const [scrollTarget, setScrollTarget] = useState(targetSection)
	const navigateToSection = useCallback((section: string) => {
		setActiveTab(tabForSection(section))
		setScrollTarget(section)
	}, [])
	useEffect(() => {
		if (targetSection) navigateToSection(targetSection)
	}, [targetSection, navigateToSection])
	useEffect(() => {
		if (!scrollTarget) return
		const frame = requestAnimationFrame(() => {
			const element = document.getElementById("settings-" + scrollTarget) ?? document.getElementById(scrollTarget)
			element?.scrollIntoView({ block: "start" })
			setScrollTarget(undefined)
		})
		return () => cancelAnimationFrame(frame)
	}, [activeTab, scrollTarget])
	const handleMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data
			if (message.type !== "grpc_response") return
			const response = message.grpc_response?.message
			if (response?.key === "scrollToSettings" && response.value) navigateToSection(response.value)
		},
		[navigateToSection],
	)
	useEvent("message", handleMessage)
	const handleResetState = useCallback(async (global?: boolean) => {
		try {
			await StateServiceClient.resetState(ResetStateRequest.create({ global }))
		} catch (error) {
			console.error("Failed to reset state:", error)
		}
	}, [])
	return (
		<Tab className="settings-view">
			<ViewHeader environment={environment} onDone={onDone} title="Settings" />
			<TabList
				aria-label="Settings categories"
				className="shrink-0 gap-1 border-b border-border-panel px-3 pb-2"
				onValueChange={setActiveTab}
				value={activeTab}>
				{SETTINGS_TABS.map((tab) => (
					<TabTrigger
						aria-controls="settings-panel"
						className={cn(
							"min-h-7 cursor-pointer rounded-xs px-2 py-1 text-base text-description hover:bg-list-hover hover:text-foreground",
							activeTab === tab.id && "bg-list-hover text-foreground font-medium",
						)}
						data-testid={"tab-" + tab.id}
						id={"settings-tab-" + tab.id}
						key={tab.id}
						value={tab.id}>
						{tab.name}
					</TabTrigger>
				))}
			</TabList>
			<TabContent
				aria-labelledby={"settings-tab-" + activeTab}
				className="min-w-0 pb-3"
				id="settings-panel"
				key={activeTab}
				role="tabpanel"
				tabIndex={0}>
				{activeTab === "api-config" ? (
					<ApiConfigurationSection initialModelTab={settingsInitialModelTab} />
				) : (
					<>
						<div id="settings-general">
							<GeneralSettingsSection renderSectionHeader={renderSectionHeader} />
						</div>
						<div id="settings-features">
							<FeatureSettingsSection renderSectionHeader={renderSectionHeader} />
						</div>
						<div id="settings-terminal">
							<TerminalSettingsSection renderSectionHeader={renderSectionHeader} />
						</div>
						{process.env.IS_DEV && (
							<div id="settings-debug">
								<DebugSection onResetState={handleResetState} renderSectionHeader={renderSectionHeader} />
							</div>
						)}
						<div id="settings-about">
							<AboutSection renderSectionHeader={renderSectionHeader} version={version} />
						</div>
					</>
				)}
			</TabContent>
		</Tab>
	)
}
export default SettingsView
