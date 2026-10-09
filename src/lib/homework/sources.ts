import "server-only";
import { requireLessonManager } from "@/lib/lesson-artifacts/server";
import { activeMembership, HomeworkError, requireHomeworkUser } from "./server";
import { questionSchema, type DraftQuestion } from "./domain";
import { readAll } from "./read-all";
export interface HomeworkSource {
  lessonId: string;
  title: string;
  subject: string;
  gradeLevel: string;
  organizationId: string | null;
  publicationId: string;
  publicationVersion: number;
  objectives: {
    id: string;
    text: string;
    revision: number;
    artifactIds?: string[];
  }[];
  eligibleStudents: { id: string; name: string }[];
  importedQuestions: DraftQuestion[];
}
export async function listSources() {
  const { db, user } = await requireHomeworkUser(true);
  const { data: teachers, error: teacherError } = await db
    .from("teachers")
    .select("id")
    .eq("user_id", user.id);
  if (teacherError) throw teacherError;
  if (!teachers?.length && user.role !== "admin") return [];
  let query = db
    .from("lessons")
    .select("id,title,subject,gradelevel,current_publication_id")
    .not("current_publication_id", "is", null)
    .order("title")
    .order("id");
  if (user.role !== "admin")
    query = query.in(
      "teacher_id",
      teachers!.map((t) => t.id),
    );
  return readAll((from, to) => query.range(from, to), 2000);
}
export async function sourceForHomework(
  lessonId: string,
  publicationId?: string,
): Promise<HomeworkSource> {
  const {
    session,
    lesson,
    supabase: db,
  } = await requireLessonManager(lessonId);
  if (!lesson.current_publication_id && !publicationId)
    throw new HomeworkError(
      409,
      "Publish the lesson in Lesson Studio before creating homework",
    );
  const { data: publication, error } = await db
    .from("lesson_publications")
    .select("id,version,manifest")
    .eq("id", publicationId ?? lesson.current_publication_id)
    .eq("lesson_id", lessonId)
    .single();
  if (error) throw error;
  const objectives: HomeworkSource["objectives"] =
    publication.manifest.objectives;
  const artifactIds = objectives.flatMap((o) => o.artifactIds ?? []);
  const { data: artifacts, error: artifactError } = artifactIds.length
    ? await db
        .from("lesson_artifacts")
        .select("id,objective_id,payload")
        .in("id", artifactIds)
        .eq("kind", "structured_quiz")
    : { data: [], error: null };
  if (artifactError) throw artifactError;
  const importedQuestions: DraftQuestion[] = [];
  for (const artifact of artifacts ?? [])
    for (const q of artifact.payload.questions ?? []) {
      const type =
        q.type === "multiple_choice" || q.type === "multiple_select"
          ? q.type
          : q.type === "true_false"
            ? "true_false"
            : "short_answer";
      const parsed = questionSchema.safeParse({
        id: crypto.randomUUID(),
        type,
        prompt: q.prompt,
        objectiveId: artifact.objective_id,
        points: Math.min(100, q.points ?? 2),
        required: true,
        options: q.options ?? [],
        correctAnswer:
          q.type === "true_false"
            ? q.correctAnswer
              ? "True"
              : "False"
            : q.type === "multiple_select"
              ? q.correctAnswer
              : String(q.correctAnswer ?? ""),
        guidance: q.explanation ?? "",
        rubric: [],
      });
      if (parsed.success) importedQuestions.push(parsed.data);
    }
  const eligibleStudents: HomeworkSource["eligibleStudents"] = [];
  if (await activeMembership(db, session!.user.id, lesson.organization_id)) {
    const members = await readAll(
      (from, to) =>
        db
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", lesson.organization_id)
          .eq("is_active", true)
          .order("user_id")
          .range(from, to),
      5000,
    );
    for (let offset = 0; offset < members.length; offset += 150) {
      const batch = members.slice(offset, offset + 150);
      const { data: students, error: studentError } = await db
        .from("students")
        .select("user_id,grade")
        .in(
          "user_id",
          batch.map((m) => m.user_id),
        );
      if (studentError) throw studentError;
      const studentIds = (students ?? [])
        .filter(
          (s) =>
            s.grade?.trim().toLowerCase() ===
            publication.manifest.lesson.gradeLevel?.trim().toLowerCase(),
        )
        .map((s) => s.user_id);
      if (studentIds.length) {
        const { data: names, error: nameError } = await db
          .from("users")
          .select("id,name")
          .in("id", studentIds)
          .eq("role", "student")
          .order("name");
        if (nameError) throw nameError;
        eligibleStudents.push(...(names ?? []));
      }
    }
  }
  eligibleStudents.sort((a, b) => a.name.localeCompare(b.name));
  return {
    lessonId,
    title: publication.manifest.lesson.title,
    subject: publication.manifest.lesson.subject,
    gradeLevel: publication.manifest.lesson.gradeLevel,
    organizationId: lesson.organization_id,
    publicationId: publication.id,
    publicationVersion: publication.version,
    objectives,
    eligibleStudents,
    importedQuestions,
  };
}
