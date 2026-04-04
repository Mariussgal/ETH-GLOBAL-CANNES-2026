import InvestStreamPage from "./InvestStreamPage";

interface InvestPageProps {
  params: { id: string };
}

export default function InvestPage({ params }: InvestPageProps) {
  return <InvestStreamPage id={params.id} />;
}
