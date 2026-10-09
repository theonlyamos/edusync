import { TeacherHomeworkInsights } from "@/components/homework/TeacherHomeworkInsights";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <TeacherHomeworkInsights id={(await params).id} />;
}
