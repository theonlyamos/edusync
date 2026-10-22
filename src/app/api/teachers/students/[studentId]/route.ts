import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase.server";
import { getUserSchoolId } from "@/lib/school";
import { StudentAccessError, teacherStudentDetail } from "@/lib/teacher-students-server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ studentId: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to see this student" }, { status: 401 });
  if (session.user.role !== "teacher") return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  const { studentId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return NextResponse.json({ error: "Student not found" }, { status: 404 });
  try {
    const db = createServerSupabase();
    const schoolId = await getUserSchoolId(db, session.user.id);
    if (!schoolId) return NextResponse.json({ error: "Join a school to see students" }, { status: 404 });
    return NextResponse.json(await teacherStudentDetail(db, session.user.id, schoolId, studentId));
  } catch (error) {
    if (error instanceof StudentAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Teacher student detail failed:", error);
    return NextResponse.json({ error: "Could not load this student" }, { status: 500 });
  }
}
