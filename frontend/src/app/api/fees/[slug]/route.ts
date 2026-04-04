import { NextRequest, NextResponse } from "next/server";

const UPSTREAM_BASE =
  process.env.FEES_PROXY_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_FEES_PROXY_URL?.replace(/\/$/, "") ??
  "https://ysm-defilama-proxy.ysm-market-proxy.workers.dev/fees";

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug;
  if (!slug || slug.length > 128) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }

  const url = `${UPSTREAM_BASE}/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "upstream_fetch_failed";
    return NextResponse.json(
      { error: "fees_upstream_unreachable", detail },
      { status: 502 }
    );
  }
}
