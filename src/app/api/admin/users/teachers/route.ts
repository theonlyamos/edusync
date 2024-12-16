import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Teacher } from "@/lib/models/Teacher";
import { createTeacher } from "@/lib/actions/user.actions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        await connectToDatabase();

        // Get all teachers with their role-specific details
        const users = await User.find({ role: "teacher" })
            .select("-password")
            .lean();

        const teacherDetails = await Promise.all(
            users.map(async (user) => {
                const teacher = await Teacher.findOne({ userId: user._id })
                    .select("-createdAt -updatedAt")
                    .lean();
                return {
                    ...user,
                    ...teacher,
                    id: user._id
                };
            })
        );

        return NextResponse.json(teacherDetails);
    } catch (error) {
        console.error("Error fetching teachers:", error);
        return NextResponse.json(
            { error: "Failed to fetch teachers" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user?.role !== 'admin') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { email, password, name, subjects, grades, qualifications, specializations } = body;

        await connectToDatabase();

        // Check if user already exists
        const existingUser = await User.findOne({ email }).lean();
        if (existingUser) {
            return NextResponse.json(
                { error: "Email already exists" },
                { status: 400 }
            );
        }

        // Create teacher using the action
        const result = await createTeacher({
            email,
            password,
            name,
            role: 'teacher',
            subjects,
            grades,
            qualifications,
            specializations
        });

        // Remove password from response
        const { password: _, ...teacherWithoutPassword } = result.user.toObject();
        return NextResponse.json({
            ...teacherWithoutPassword,
            ...result.teacher.toObject()
        });
    } catch (error) {
        console.error("Error creating teacher:", error);
        return NextResponse.json(
            { error: "Failed to create teacher" },
            { status: 500 }
        );
    }
} 