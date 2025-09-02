import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
    request: Request,
    context: any
) {
    const { params } = context as { params: { level: string } };
    try {
        const { level } = await params;
        const { data: grade, error } = await supabase
            .from('grades')
            .select('*, teachers:grade_teachers(*), students:grade_students(*)')
            .eq('level', level)
            .maybeSingle();
        if (error) throw error;

        if (!grade) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(grade);
    } catch (error) {
        console.error("Error fetching grade:", error);
        return NextResponse.json(
            { error: "Failed to fetch grade" },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: Request,
    context: any
) {
    const { params } = context as { params: { level: string } };
    try {
        const body = await request.json();
        const { data: updatedGrade, error } = await supabase
            .from('grades')
            .update(body)
            .eq('level', params.level)
            .select('*, teachers:grade_teachers(*), students:grade_students(*)')
            .maybeSingle();
        if (error) throw error;

        if (!updatedGrade) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(updatedGrade);
    } catch (error) {
        console.error("Error updating grade:", error);
        return NextResponse.json(
            { error: "Failed to update grade" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    context: any
) {
    const { params } = context as { params: { level: string } };
    try {
        const { data: deletedGrade, error } = await supabase
            .from('grades')
            .delete()
            .eq('level', params.level)
            .select('level')
            .maybeSingle();
        if (error) throw error;

        if (!deletedGrade) {
            return NextResponse.json(
                { error: "Grade not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ message: "Grade deleted successfully" });
    } catch (error) {
        console.error("Error deleting grade:", error);
        return NextResponse.json(
            { error: "Failed to delete grade" },
            { status: 500 }
        );
    }
} 