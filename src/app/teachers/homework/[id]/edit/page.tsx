import { Suspense } from "react";
import { TeacherHomeworkEditor } from "@/components/homework/TeacherHomeworkEditor";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading homework editor…</p>}>
      <TeacherHomeworkEditor id={(await params).id} />
    </Suspense>
  );
}
