import type { ReactNode } from "react";

interface TooltipProps {
  label: string;
  children: ReactNode;
}

export function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="bg-text text-surface-card pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
        <span className="bg-text absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-current" />
      </span>
    </span>
  );
}
