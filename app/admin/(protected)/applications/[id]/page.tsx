import { ApplicationCard } from "../ApplicationCard";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { id } = await params;
  const { done } = await searchParams;
  return <ApplicationCard applicationId={id} done={done ?? null} />;
}
