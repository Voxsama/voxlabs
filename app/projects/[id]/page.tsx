import { Studio } from "@/components/studio/Studio";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Studio projectId={id} />;
}
