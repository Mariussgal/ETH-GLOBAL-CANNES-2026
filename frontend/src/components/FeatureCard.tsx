interface FeatureCardProps {
  index: string;
  title: string;
  description: string;
  metric?: string;
  metricLabel?: string;
}

export default function FeatureCard({
  index,
  title,
  description,
  metric,
  metricLabel,
}: FeatureCardProps) {
  return (
    <div className="bg-surface border border-border rounded-card p-lg flex flex-col justify-between min-h-[240px] transition-colors duration-200 ease-nothing hover:border-border-visible group">
      {/* Top — Index + Title */}
      <div>
        <span className="font-mono text-label uppercase tracking-label text-text-disabled block mb-md">
          {index}
        </span>
        <h3 className="font-grotesk text-subheading sm:text-heading text-text-display font-medium mb-sm">
          {title}
        </h3>
        <p className="font-grotesk text-body-sm text-text-secondary leading-relaxed">
          {description}
        </p>
      </div>

      {/* Bottom — Metric (optional) */}
      {metric && (
        <div className="mt-lg pt-md border-t border-border">
          <span className="font-mono text-heading sm:text-display-md text-text-display">
            {metric}
          </span>
          {metricLabel && (
            <span className="font-mono text-label uppercase tracking-label text-text-secondary ml-sm">
              {metricLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
