interface ReviewBadgeProps {
  confidence: string;
}

export function ReviewBadge({ confidence }: ReviewBadgeProps) {
  if (confidence === "high") {
    return (
      <span className="bg-accent-green/10 text-accent-green rounded-full px-1.5 py-0.5 text-[11px] font-medium">
        confirmed
      </span>
    );
  }

  return (
    <span className="bg-badge-amber text-badge-amber-text rounded-full px-1.5 py-0.5 text-[11px] font-medium">
      review
    </span>
  );
}
