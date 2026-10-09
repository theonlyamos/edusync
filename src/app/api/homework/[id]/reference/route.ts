import { NextResponse } from "next/server";
import {
  requireHomework,
  homeworkError,
  HomeworkError,
} from "@/lib/homework/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params,
      { db, user, homework } = await requireHomework(id);
    if (user.role === "student" && !homework.allow_references)
      throw new HomeworkError(
        403,
        "Lesson references are disabled for this homework",
      );
    const { data, error } = await db
      .from("lesson_publications")
      .select("manifest,version")
      .eq("id", homework.publication_id)
      .eq("lesson_id", homework.lesson_id)
      .single();
    if (error) throw error;
    return NextResponse.json({
      title: data.manifest.lesson.title,
      content: data.manifest.lesson.content ?? "",
      version: data.version,
      objectives: homework.objectives,
    });
  } catch (error) {
    return homeworkError(error);
  }
}
