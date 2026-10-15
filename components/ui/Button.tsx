import type { ButtonHTMLAttributes } from "react";

const VARIANT_CLASS = {
  primary: "primary-button",
  secondary: "secondary-button",
  ghost: "text-button",
  danger: "danger-button"
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASS;

/** Thin wrapper over the existing button classes so screens can migrate without visual change. */
export default function Button({ className = "", type = "button", variant = "secondary", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`${VARIANT_CLASS[variant]} ${className}`.trim()} type={type} {...rest} />;
}
