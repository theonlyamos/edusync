import { TeacherHomeworkDetail } from "@/components/homework/TeacherHomeworkDetail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <TeacherHomeworkDetail id={(await params).id} />;
}
