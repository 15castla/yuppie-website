import { MemberCard } from "../MemberCard";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MemberCard memberId={id} />;
}
