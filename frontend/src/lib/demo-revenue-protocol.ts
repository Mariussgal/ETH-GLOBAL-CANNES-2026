/**
 * Slugs for which we inject an activity stream and simulated totals (hackathon demo).
 * Default: nohemmg (stream created on the team side). Override: NEXT_PUBLIC_DEMO_REVENUE_SLUGS=slug1,slug2
 */
const DEFAULT_SLUGS = ["nohemmg", "nohem-mg", "nohem_mg"];

function slugListFromEnv(): string[] {
  const raw = process.env.NEXT_PUBLIC_DEMO_REVENUE_SLUGS?.trim();
  if (!raw) return DEFAULT_SLUGS;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function shouldSimulateDemoRevenue(protocolSlug: string): boolean {
  const needle = protocolSlug.trim().toLowerCase();
  return slugListFromEnv().some((s) => s === needle);
}
