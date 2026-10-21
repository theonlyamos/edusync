import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase.server";
import { getUserSchoolId } from "@/lib/school";
import { teacherDashboard } from "@/lib/dashboard-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Sign in to see your dashboard" }, { status: 401 });
  if (session.user.role !== "teacher" && session.user.role !== "admin")
    return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  try {
    const db = createServerSupabase();
    const schoolId = await getUserSchoolId(db, session.user.id);
    return NextResponse.json(await teacherDashboard(db, session.user.id, schoolId));
  } catch (error) {
    console.error("Teacher dashboard failed:", error);
    return NextResponse.json({ error: "Could not load your dashboard" }, { status: 500 });
  }
}
