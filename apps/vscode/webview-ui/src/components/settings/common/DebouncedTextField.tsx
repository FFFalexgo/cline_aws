import { useId } from "react"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useDebouncedInput } from "../utils/useDebouncedInput"

interface DebouncedTextFieldProps {
	initialValue: string
	onChange: (value: string) => void
	style?: React.CSSProperties
	type?: "text" | "password"
	placeholder?: string
	id?: string
	children?: React.ReactNode
	description?: string
	disabled?: boolean
	className?: string
}
export const DebouncedTextField = ({
	initialValue,
	onChange,
	children,
	description,
	id,
	style,
	className,
	...props
}: DebouncedTextFieldProps) => {
	const generatedId = useId()
	const inputId = id ?? generatedId
	const descriptionId = inputId + "-description"
	const [localValue, setLocalValue] = useDebouncedInput(initialValue, onChange)
	return (
		<Field className={className} style={style}>
			{children && <FieldLabel htmlFor={inputId}>{children}</FieldLabel>}
			<Input
				{...props}
				aria-describedby={description ? descriptionId : undefined}
				id={inputId}
				onChange={(event) => setLocalValue(event.target.value)}
				value={localValue}
			/>
			{description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
		</Field>
	)
}
