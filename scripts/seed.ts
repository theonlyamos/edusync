import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Grade } from "@/lib/models/Grade";
import { Timetable } from "@/lib/models/Timetable";
import bcrypt from "bcryptjs";

async function seedUsers() {
    try {
        // Create admin
        const adminPassword = await bcrypt.hash("admin123", 10);
        const admin = await User.create({
            name: "Admin User",
            email: "admin@edusync.com",
            password: adminPassword,
            role: "admin"
        });

        // Create teachers
        const teacherPassword = await bcrypt.hash("teacher123", 10);
        const teachers = await User.create([
            {
                name: "John Smith",
                email: "john@edusync.com",
                password: teacherPassword,
                role: "teacher",
                subject: "Mathematics"
            },
            {
                name: "Sarah Wilson",
                email: "sarah@edusync.com",
                password: teacherPassword,
                role: "teacher",
                subject: "Science"
            },
            {
                name: "Michael Brown",
                email: "michael@edusync.com",
                password: teacherPassword,
                role: "teacher",
                subject: "English"
            }
        ]);

        // Create students
        const studentPassword = await bcrypt.hash("student123", 10);
        const students = await User.create([
            {
                name: "Alice Johnson",
                email: "alice@edusync.com",
                password: studentPassword,
                role: "student",
                grade: "Grade 10"
            },
            {
                name: "Bob Williams",
                email: "bob@edusync.com",
                password: studentPassword,
                role: "student",
                grade: "Grade 10"
            },
            {
                name: "Carol Davis",
                email: "carol@edusync.com",
                password: studentPassword,
                role: "student",
                grade: "Grade 11"
            }
        ]);

        console.log("Users seeded successfully");
        return { admin, teachers, students };
    } catch (error) {
        console.error("Error seeding users:", error);
        throw error;
    }
}


async function seedTimetables(grades: any[], teachers: any[]) {
    try {
        const currentYear = new Date().getFullYear();
        const academicYear = `${currentYear}-${currentYear + 1}`;

        const timetables = await Timetable.create([
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
        ]);

        console.log("Timetables seeded successfully");
        return timetables;
    } catch (error) {
        console.error("Error seeding timetables:", error);
        throw error;
    }
}

async function main() {
    try {
        await connectToDatabase();

        // Clear existing data
        await User.deleteMany({});
        await Grade.deleteMany({});
        await Timetable.deleteMany({});

        // Seed users first
        const { admin, teachers, students } = await seedUsers();

        // Then seed grades with references to users
        const grades = await seedGrades(teachers, students);

        // Finally seed timetables
        await seedTimetables(grades, teachers);

        console.log("Database seeded successfully");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding database:", error);
        process.exit(1);
    }
}

main();
