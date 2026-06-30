import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-cream/50 px-6 py-16 text-center">
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-clay-50 text-clay-400">
          {icon}
        </div>
      )}
      <h3 className="font-serif text-lg font-semibold text-ink">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-ink/55">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
