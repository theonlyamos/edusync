import bcrypt from "bcryptjs";
import { createServerSupabase } from "../src/lib/supabase.server";

async function seedUsers(supabase: ReturnType<typeof createServerSupabase>) {
    try {
        // Create admin
        const adminPassword = await bcrypt.hash("admin123", 10);
        const { data: admin, error: adminErr } = await supabase
            .from('users')
            .insert({ name: 'Admin User', email: 'admin@edusync.com', password: adminPassword, role: 'admin' })
            .select('*')
            .single();
        if (adminErr) throw adminErr;

        // Create teachers
        const teacherPassword = await bcrypt.hash("teacher123", 10);
        const teacherRows = [
            { name: 'John Smith', email: 'john@edusync.com', password: teacherPassword, role: 'teacher', subject: 'Mathematics' },
            { name: 'Sarah Wilson', email: 'sarah@edusync.com', password: teacherPassword, role: 'teacher', subject: 'Science' },
            { name: 'Michael Brown', email: 'michael@edusync.com', password: teacherPassword, role: 'teacher', subject: 'English' },
        ];
        const { data: teachers, error: teachersErr } = await supabase
            .from('users')
            .insert(teacherRows)
            .select('*');
        if (teachersErr) throw teachersErr;

        // Create students
        const studentPassword = await bcrypt.hash("student123", 10);
        const studentRows = [
            { name: 'Alice Johnson', email: 'alice@edusync.com', password: studentPassword, role: 'student', grade: 'Grade 10' },
            { name: 'Bob Williams', email: 'bob@edusync.com', password: studentPassword, role: 'student', grade: 'Grade 10' },
            { name: 'Carol Davis', email: 'carol@edusync.com', password: studentPassword, role: 'student', grade: 'Grade 11' },
        ];
        const { data: students, error: studentsErr } = await supabase
            .from('users')
            .insert(studentRows)
            .select('*');
        if (studentsErr) throw studentsErr;

        console.log("Users seeded successfully");
        return { admin, teachers: teachers ?? [], students: students ?? [] };
    } catch (error) {
        console.error("Error seeding users:", error);
        throw error;
    }
}

async function seedGrades(supabase: ReturnType<typeof createServerSupabase>, teachers: any[], students: any[]) {
    const data = [
        {
            level: 'Grade 10',
            name: 'Grade 10',
            subjects: ['Mathematics', 'Physics', 'Chemistry', 'Biology'],
            teachers: teachers.map((t: any) => t.id ?? t._id?.toString()).filter(Boolean),
            students: students.filter((s: any) => s.grade === 'Grade 10').map((s: any) => s.id ?? s._id?.toString()).filter(Boolean),
        },
        {
            level: 'Grade 11',
            name: 'Grade 11',
            subjects: ['English Literature', 'Creative Writing', 'History', 'Arts'],
            teachers: teachers.map((t: any) => t.id ?? t._id?.toString()).filter(Boolean),
            students: students.filter((s: any) => s.grade === 'Grade 11').map((s: any) => s.id ?? s._id?.toString()).filter(Boolean),
        },
    ];

    const { data: inserted, error } = await supabase.from('grades').insert(data).select('*');
    if (error) throw error;
    return inserted ?? [];
}

async function seedTimetables(supabase: ReturnType<typeof createServerSupabase>, grades: any[], teachers: any[]) {
    try {
        const currentYear = new Date().getFullYear();
        const academicYear = `${currentYear}-${currentYear + 1}`;

        const { data: timetables, error } = await supabase.from('timetables').insert([
            {
                grade: grades[0].level, // Grade 10
                academicYear,
                term: "First",
                effectiveFrom: new Date(),
                isActive: true,
                periods: [
                    {
                        day: "Monday",
                        startTime: "08:00",
                        endTime: "09:30",
                        subject: "Mathematics",
                        teacher: teachers[0]._id,
                        room: "Room 101"
                    },
                    {
                        day: "Monday",
                        startTime: "10:00",
                        endTime: "11:30",
                        subject: "Physics",
                        teacher: teachers[1]._id,
                        room: "Lab 1"
                    },
                    {
                        day: "Tuesday",
                        startTime: "08:00",
                        endTime: "09:30",
                        subject: "Chemistry",
                        teacher: teachers[1]._id,
                        room: "Lab 2"
                    },
                    {
                        day: "Tuesday",
                        startTime: "10:00",
                        endTime: "11:30",
                        subject: "Biology",
                        teacher: teachers[1]._id,
                        room: "Lab 3"
                    }
                ]
            },
            {
                grade: grades[1].level, // Grade 11
                academicYear,
                term: "First",
                effectiveFrom: new Date(),
                isActive: true,
                periods: [
                    {
                        day: "Monday",
                        startTime: "08:00",
                        endTime: "09:30",
                        subject: "English Literature",
                        teacher: teachers[2]._id,
                        room: "Room 201"
                    },
                    {
                        day: "Monday",
                        startTime: "10:00",
                        endTime: "11:30",
                        subject: "Creative Writing",
                        teacher: teachers[2]._id,
                        room: "Room 202"
                    },
                    {
                        day: "Tuesday",
                        startTime: "08:00",
                        endTime: "09:30",
                        subject: "History",
                        teacher: teachers[2]._id,
                        room: "Room 203"
                    },
                    {
                        day: "Tuesday",
                        startTime: "10:00",
                        endTime: "11:30",
                        subject: "Arts",
                        teacher: teachers[2]._id,
                        room: "Art Studio"
                    }
                ]
            }
        ]).select('*');
        if (error) throw error;

        console.log("Timetables seeded successfully");
        return timetables;
    } catch (error) {
        console.error("Error seeding timetables:", error);
        throw error;
    }
}

async function main() {
    try {
        const supabase = createServerSupabase();
        await supabase.from('timetables').delete().neq('grade', '');
        await supabase.from('grades').delete().neq('level', '');
        await supabase.from('users').delete().neq('email', '');

        // Seed users first
        const { admin, teachers, students } = await seedUsers(supabase);

        // Then seed grades with references to users
        const grades = await seedGrades(supabase, teachers, students);

        // Finally seed timetables
        await seedTimetables(supabase, grades, teachers);

        console.log("Database seeded successfully");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding database:", error);
        process.exit(1);
    }
}

main();
