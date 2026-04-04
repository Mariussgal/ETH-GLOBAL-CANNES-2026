"use client";

interface SegmentedProgressProps {
  value: number;
  max: number;
  segments?: number;
  status?: "neutral" | "success" | "warning" | "accent";
  size?: "hero" | "standard" | "compact";
  /** Square blocks (grid), Nothing / instrument panel */
  variant?: "bar" | "blocks";
  animated?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  neutral: "bg-text-display",
  success: "bg-success",
  warning: "bg-warning",
  accent: "bg-accent",
};

const SIZE_HEIGHTS: Record<string, string> = {
  hero: "h-[16px]",
  standard: "h-[8px]",
  compact: "h-[4px]",
};

export default function SegmentedProgress({
  value,
  max,
  segments = 20,
  status = "neutral",
  size = "standard",
  variant = "bar",
  animated = false,
}: SegmentedProgressProps) {
  const filledCount = Math.round((value / max) * segments);
  const fillColor = STATUS_COLORS[status];
  const height = SIZE_HEIGHTS[size];

  if (variant === "blocks") {
    return (
      <div
        className="grid w-full gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`aspect-square w-full min-h-0 ${
              i < filledCount ? fillColor : "bg-border"
            } transition-colors duration-200 ease-nothing rounded-technical`}
            style={
              animated && i < filledCount
                ? {
                    animation: `segmentFadeIn 150ms ease-out ${i * 80}ms both`,
                  }
                : undefined
            }
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-[2px] w-full">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={`flex-1 ${height} ${
            i < filledCount ? fillColor : "bg-border"
          } transition-colors duration-200 ease-nothing`}
          style={
            animated && i < filledCount
              ? {
                  animation: `segmentFadeIn 150ms ease-out ${i * 80}ms both`,
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
