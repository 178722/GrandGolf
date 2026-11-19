import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variantClasses: Record<Variant, string> = {
  primary: "bg-green-700 text-white hover:bg-green-800 disabled:bg-gray-300",
  secondary: "bg-white text-gray-800 border border-gray-300 hover:bg-gray-100 disabled:text-gray-400",
  danger: "bg-white text-red-600 border border-red-300 hover:bg-red-50 disabled:text-gray-400",
  ghost: "bg-transparent text-gray-600 hover:bg-gray-100 disabled:text-gray-300",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
