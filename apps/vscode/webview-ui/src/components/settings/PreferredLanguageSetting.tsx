import { memo } from "react"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { updateSetting } from "./utils/settingsHandlers"

const PreferredLanguageSetting = () => {
	const { preferredLanguage } = useExtensionState()
	return (
		<Field>
			<FieldLabel htmlFor="preferred-language-dropdown">Preferred Language</FieldLabel>
			<Select onValueChange={(value) => updateSetting("preferredLanguage", value)} value={preferredLanguage || "English"}>
				<SelectTrigger aria-describedby="language-description" className="w-full" id="preferred-language-dropdown">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						<SelectItem value="English">English</SelectItem>
						<SelectItem value="Arabic - العربية">Arabic - العربية</SelectItem>
						<SelectItem value="Portuguese - Português (Brasil)">Portuguese - Português (Brasil)</SelectItem>
						<SelectItem value="Czech - Čeština">Czech - Čeština</SelectItem>
						<SelectItem value="French - Français">French - Français</SelectItem>
						<SelectItem value="German - Deutsch">German - Deutsch</SelectItem>
						<SelectItem value="Hindi - हिन्दी">Hindi - हिन्दी</SelectItem>
						<SelectItem value="Hungarian - Magyar">Hungarian - Magyar</SelectItem>
						<SelectItem value="Italian - Italiano">Italian - Italiano</SelectItem>
						<SelectItem value="Japanese - 日本語">Japanese - 日本語</SelectItem>
						<SelectItem value="Korean - 한국어">Korean - 한국어</SelectItem>
						<SelectItem value="Polish - Polski">Polish - Polski</SelectItem>
						<SelectItem value="Portuguese - Português (Portugal)">Portuguese - Português (Portugal)</SelectItem>
						<SelectItem value="Russian - Русский">Russian - Русский</SelectItem>
						<SelectItem value="Simplified Chinese - 简体中文">Simplified Chinese - 简体中文</SelectItem>
						<SelectItem value="Spanish - Español">Spanish - Español</SelectItem>
						<SelectItem value="Traditional Chinese - 繁體中文">Traditional Chinese - 繁體中文</SelectItem>
						<SelectItem value="Turkish - Türkçe">Turkish - Türkçe</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
			<FieldDescription id="language-description">The language Bedrock Coder uses for communication.</FieldDescription>
		</Field>
	)
}
export default memo(PreferredLanguageSetting)
