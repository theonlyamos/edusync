import { HomeworkList } from "@/components/homework/HomeworkList";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ lessonId?: string }>;
}) {
  return <HomeworkList lessonId={(await searchParams).lessonId} />;
}
