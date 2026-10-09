import { StudentHomework } from "@/components/homework/StudentHomework";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <StudentHomework id={(await params).id} />;
}
