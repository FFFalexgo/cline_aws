import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { TabList, TabTrigger } from "./Tab"

const Categories = () => {
	const [value, setValue] = useState("general")
	return (
		<TabList onValueChange={setValue} value={value}>
			<TabTrigger value="general">General</TabTrigger>
			<TabTrigger disabled value="unavailable">
				Unavailable
			</TabTrigger>
			<TabTrigger value="terminal">Terminal</TabTrigger>
			<TabTrigger value="about">About</TabTrigger>
		</TabList>
	)
}

describe("Settings category keyboard navigation", () => {
	it("moves focus and selection together, skips disabled categories, and wraps", () => {
		render(<Categories />)
		const general = screen.getByRole("tab", { name: "General" })
		const terminal = screen.getByRole("tab", { name: "Terminal" })
		const about = screen.getByRole("tab", { name: "About" })
		general.focus()
		fireEvent.keyDown(general, { key: "ArrowRight" })
		expect(terminal).toHaveFocus()
		expect(terminal).toHaveAttribute("aria-selected", "true")
		fireEvent.keyDown(terminal, { key: "ArrowLeft" })
		expect(general).toHaveFocus()
		fireEvent.keyDown(general, { key: "ArrowLeft" })
		expect(about).toHaveFocus()
		expect(about).toHaveAttribute("aria-selected", "true")
	})

	it("supports Home and End without intercepting unrelated keys", () => {
		render(<Categories />)
		const general = screen.getByRole("tab", { name: "General" })
		const about = screen.getByRole("tab", { name: "About" })
		general.focus()
		fireEvent.keyDown(general, { key: "End" })
		expect(about).toHaveFocus()
		fireEvent.keyDown(about, { key: "Home" })
		expect(general).toHaveFocus()
		fireEvent.keyDown(general, { key: "a" })
		expect(general).toHaveAttribute("aria-selected", "true")
	})
})
