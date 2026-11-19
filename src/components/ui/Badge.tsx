export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "muted" | "warning";
}) {
  const toneClasses = {
    default: "bg-gray-100 text-gray-700",
    success: "bg-green-100 text-green-800",
    muted: "bg-gray-200 text-gray-600",
    warning: "bg-amber-100 text-amber-800",
  }[tone];

  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClasses}`}>
      {children}
    </span>
  );
}
