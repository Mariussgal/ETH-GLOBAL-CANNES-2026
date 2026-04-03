import StreamInvestView from "@/components/invest/StreamInvestView";
import { getStreamById } from "@/lib/mock-streams";
import { notFound } from "next/navigation";

interface InvestPageProps {
  params: { id: string };
}

export default function InvestPage({ params }: InvestPageProps) {
  const stream = getStreamById(params.id);
  if (!stream) {
    notFound();
  }
  return <StreamInvestView stream={stream} />;
}
