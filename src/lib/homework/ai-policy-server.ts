import "server-only";
import { createServerSupabase } from "@/lib/supabase.server";
import { attemptIsEditable, type Homework, type Attempt } from "./domain";
export async function editableHomeworkForUser(userId: string) {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("homework_attempts")
    .select(
      "homework_id,submitted_at,revision_due_at,homeworks!inner(organization_id,status,due_at,close_at,accept_late)",
    )
    .eq("student_id", userId)
    .is("submitted_at", null)
    .eq("homeworks.status", "published");
  if (error) throw error;
  const { data: members, error: memberError } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (memberError) throw memberError;
  const organizations = new Set(members?.map((m) => m.organization_id));
  if (!data?.length) return null;
  const { data: recipients, error: recipientError } = await db
    .from("homework_recipients")
    .select("homework_id,extension_at")
    .eq("student_id", userId)
    .in(
      "homework_id",
      data.map((a) => a.homework_id),
    );
  if (recipientError) throw recipientError;
  return (
    data.find((row) => {
      const a = row as unknown as Attempt & { homeworks: Homework };
      return (
        organizations.has(a.homeworks.organization_id) &&
        attemptIsEditable(
          a.homeworks,
          a,
          recipients?.find((r) => r.homework_id === a.homework_id)
            ?.extension_at ?? null,
        )
      );
    }) ?? null
  );
}
