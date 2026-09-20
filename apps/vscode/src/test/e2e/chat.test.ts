import { expect } from "@playwright/test"
import { e2e } from "./utils/helpers"

e2e("Chat - accepts input and switches between modes", async ({ page, sidebar }) => {
	// Startup notifications can cover the right sidebar even with Do Not Disturb enabled.
	const clearNotification = page.locator(".notifications-toasts.visible").getByRole("button", { name: /^Clear Notification/ })
	await page.addLocatorHandler(clearNotification.first(), async (button) => button.click(), { noWaitAfter: true })

	const inputbox = sidebar.getByTestId("chat-input")
	await expect(inputbox).toBeVisible()

	// Makes sure the act and plan switches are working correctly.
	const modeButton = sidebar.getByTestId("mode-switch")
	await expect(modeButton).toHaveAccessibleName("Mode: Act. Switch to Plan")
	await modeButton.click()
	await expect(modeButton).toHaveAccessibleName("Mode: Plan. Switch to Act")

	// Slash commands preserve following text.
	await expect(inputbox).toHaveValue("")
	await inputbox.fill("/newt")
	await inputbox.focus()
	await sidebar.getByText("newtask", { exact: false }).click()
	await expect(inputbox).toHaveValue("/newtask ")

	await inputbox.pressSequentially("following text should be preserved")
	await expect(inputbox).toHaveValue("/newtask following text should be preserved")

	// Mentions preserve following text.
	await inputbox.fill("")
	await inputbox.fill("@prob")
	await sidebar.getByText("Problems", { exact: false }).first().click()
	await expect(inputbox).toHaveValue("@problems ")

	await inputbox.pressSequentially("following text should be preserved")
	await expect(inputbox).toHaveValue("@problems following text should be preserved")
})
