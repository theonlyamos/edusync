import { Suspense } from "react";
import { TeacherHomeworkEditor } from "@/components/homework/TeacherHomeworkEditor";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading homework editor…</p>}>
      <TeacherHomeworkEditor />
    </Suspense>
  );
}
