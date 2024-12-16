import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Lesson } from "@/lib/models/Lesson";
import { auth } from "@/auth";

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const grade = searchParams.get('grade');
        const subject = searchParams.get('subject');

        await connectToDatabase();

        let query: any = {};
        if (grade) query.grade = grade;
        if (subject) query.subject = subject;

        if (session.user.role === 'teacher') {
            query.teacher = session.user.id;
        }

        const lessons = await Lesson.find(query)
            .populate('teacher', 'name')
            .sort({ createdAt: -1 })
            .lean();

        return NextResponse.json(lessons);
    } catch (error) {
        console.error("Error fetching lessons:", error);
        return NextResponse.json(
            { error: "Failed to fetch lessons" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || session.user.role !== 'teacher') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await request.json();
        await connectToDatabase();

        const lesson = await Lesson.create({
            ...body,
            teacher: session.user.id,
            status: 'draft'
        });

        const populatedLesson = await Lesson.findById(lesson._id)
            .populate('teacher', 'name')
            .lean();

        return NextResponse.json(populatedLesson);
    } catch (error) {
        console.error("Error creating lesson:", error);
        return NextResponse.json(
            { error: "Failed to create lesson" },
            { status: 500 }
        );
    }
} 