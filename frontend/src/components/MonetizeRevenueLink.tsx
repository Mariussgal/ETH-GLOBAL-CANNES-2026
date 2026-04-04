"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useMarketplaceOnChainStreams } from "@/hooks/useMarketplaceOnChainStreams";

type Props = {
  className?: string;
  children?: React.ReactNode;
};

/**
 * MONETIZE REVENUE → /dashboard/issuer si le wallet a au moins un stream émetteur, sinon /create.
 */
export default function MonetizeRevenueLink({ className, children }: Props) {
  const { address } = useAccount();
  const { rows, isLoading } = useMarketplaceOnChainStreams();

  const hasIssuerStream = useMemo(
    () =>
      Boolean(
        address &&
          rows.some(
            (r) => r.emitter.toLowerCase() === address.toLowerCase()
          )
      ),
    [rows, address]
  );

  const href =
    !address
      ? "/create"
      : isLoading
        ? "/dashboard/issuer"
        : hasIssuerStream
          ? "/dashboard/issuer"
          : "/create";

  return (
    <Link href={href} className={className}>
      {children ?? <span>MONETIZE REVENUE</span>}
    </Link>
  );
}
