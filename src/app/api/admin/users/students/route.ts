import { NextResponse } from "next/server";
import { ACCOUNTS_COME_FROM_SCHOOLS, withSchoolNames } from "@/lib/platform-admin.server";
import { getServerSession } from "@/lib/auth";
import { createServerSupabase } from '@/lib/supabase.server'

export async function GET() {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        if (session.user.role !== 'admin') {
            return NextResponse.json(
                { error: 'Admin access required' },
                { status: 403 }
            );
        }

        const supabase = createServerSupabase();

        const { data, error } = await supabase
            .from('students_view')
            .select('*')
            .order('createdat', { ascending: false });

        if (error) throw error;
        return NextResponse.json(await withSchoolNames(supabase, (data ?? []) as Array<{ id: string }>));
    } catch (error) {
        console.error("Error fetching students with user data:", error);
        return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
    }
}

/** Support no longer creates accounts or types passwords. Schools invite people. */
export async function POST() {
    return NextResponse.json({ error: ACCOUNTS_COME_FROM_SCHOOLS }, { status: 410 });
}
