import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase.server";
import { getUserSchoolId } from "@/lib/school";
import { teacherRoster } from "@/lib/teacher-students-server";

export const dynamic = "force-dynamic";

/** Students in the teacher's school, with how they are doing on the teacher's homework. */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to see your students" }, { status: 401 });
  if (session.user.role !== "teacher") return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  try {
    const db = createServerSupabase();
    const schoolId = await getUserSchoolId(db, session.user.id);
    if (!schoolId) return NextResponse.json({ students: [], teacherGrades: [] });
    return NextResponse.json(await teacherRoster(db, session.user.id, schoolId));
  } catch (error) {
    console.error("Teacher roster failed:", error);
    return NextResponse.json({ error: "Could not load your students" }, { status: 500 });
  }
}
