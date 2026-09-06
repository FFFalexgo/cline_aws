import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import SettingsView from "./SettingsView"

vi.mock("@/context/ExtensionStateContext", () => ({ useExtensionState: () => ({ version: "0.1.4", environment: "production" }) }))
vi.mock("@/services/grpc-client", () => ({ StateServiceClient: { resetState: vi.fn() } }))
vi.mock("./sections/ApiConfigurationSection", () => ({ default: () => <div>Connection form</div> }))
vi.mock("./sections/GeneralSettingsSection", () => ({ default: () => <div>Language preferences</div> }))
vi.mock("./sections/FeatureSettingsSection", () => ({ default: () => <div>Feature preferences</div> }))
vi.mock("./sections/TerminalSettingsSection", () => ({ default: () => <div>Terminal preferences</div> }))
vi.mock("./sections/AboutSection", () => ({ default: ({ version }: { version: string }) => <div>About {version}</div> }))
vi.mock("./sections/DebugSection", () => ({ default: () => <div>Developer tools</div> }))
describe("Settings navigation", () => {
	it("offers two categories and keeps merged settings reachable in General", () => {
		render(<SettingsView onDone={() => {}} />)
		expect(screen.getAllByRole("tab")).toHaveLength(2)
		expect(screen.getByText("Connection form")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("tab", { name: "General" }))
		for (const text of ["Language preferences", "Feature preferences", "Terminal preferences", "About 0.1.4"])
			expect(screen.getByText(text)).toBeInTheDocument()
		expect(screen.queryByText("Connection form")).not.toBeInTheDocument()
	})
	it.each([
		"features",
		"terminal",
		"about",
		"optional-features",
		"terminal-settings-section",
	])("resolves legacy target %s to General", (targetSection) => {
		render(<SettingsView onDone={() => {}} targetSection={targetSection} />)
		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true")
		expect(screen.getByText("Terminal preferences")).toBeInTheDocument()
	})
	it("responds to host navigation messages and later target changes", () => {
		const { rerender } = render(<SettingsView onDone={() => {}} />)
		fireEvent(
			window,
			new MessageEvent("message", {
				data: { type: "grpc_response", grpc_response: { message: { key: "scrollToSettings", value: "terminal" } } },
			}),
		)
		expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true")
		rerender(<SettingsView onDone={() => {}} targetSection="api-config" />)
		expect(screen.getByText("Connection form")).toBeInTheDocument()
	})
})
