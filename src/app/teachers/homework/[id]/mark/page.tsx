import { Suspense } from "react";
import { TeacherHomeworkMarking } from "@/components/homework/TeacherHomeworkMarking";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading marking workspace…</p>}>
      <TeacherHomeworkMarking id={(await params).id} />
    </Suspense>
  );
}
