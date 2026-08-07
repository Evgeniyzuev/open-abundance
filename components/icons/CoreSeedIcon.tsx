import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

const CoreSeedIcon = forwardRef<SVGSVGElement, LucideProps>(function CoreSeedIcon(
  { absoluteStrokeWidth, color = "currentColor", size = 24, strokeWidth = 2, ...props },
  ref
) {
  const resolvedStrokeWidth = absoluteStrokeWidth && Number(size)
    ? (Number(strokeWidth) * 24) / Number(size)
    : strokeWidth;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={resolvedStrokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 17v-6.5" />
      <path d="M12 11c0-2.6 1.7-4.3 4.8-4.3 0 2.7-1.7 4.3-4.8 4.3Z" />
      <path d="M12 13c0-2.1-1.4-3.5-4-3.5 0 2.2 1.4 3.5 4 3.5Z" />
      <path d="M9.4 17.2c.9-.5 1.7-.7 2.6-.7s1.7.2 2.6.7" />
    </svg>
  );
});

CoreSeedIcon.displayName = "CoreSeedIcon";

export default CoreSeedIcon;
