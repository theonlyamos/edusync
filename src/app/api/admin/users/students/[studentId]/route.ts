import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase.server'

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ studentId: string }> }
) {
    try {
        const { studentId } = await params;
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = createServerSupabase();

        // Join users and students tables
        const { data, error } = await supabase
            .from('users')
            .select(`
                *,
                students (
                    grade,
                    guardianname,
                    guardiancontact,
                    enrollment_date,
                    date_of_birth
                )
            `)
            .eq('id', studentId)
            .eq('role', 'student')
            .maybeSingle();

        if (error) throw error;
        if (!data) return new NextResponse('Student not found', { status: 404 });

        // Flatten the response
        const student = Array.isArray(data.students) ? data.students[0] : data.students;
        const flattenedData = {
            id: data.id,
            name: data.name,
            email: data.email,
            isActive: data.isactive ?? data.isActive, // Handle lowercase from DB
            createdAt: data.createdat ?? data.createdAt,
            lastLogin: data.lastlogin ?? data.lastLogin,
            lastActivity: data.lastactivity ?? data.lastActivity,
            // Student specific fields
            grade: student?.grade,
            guardianName: student?.guardianname ?? student?.guardianName,
            guardianContact: student?.guardiancontact ?? student?.guardianContact,
            enrollmentDate: student?.enrollment_date,
            dateOfBirth: student?.date_of_birth,
        };

        return NextResponse.json(flattenedData);
    } catch (error) {
        console.error('Error fetching student data:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ studentId: string }> }
) {
    try {
        const { studentId } = await params;
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = createServerSupabase();

        const updates = await req.json();

        // Separate updates for User and Student models
        const userUpdates: { [key: string]: any } = {};
        const studentUpdates: { [key: string]: any } = {};

        // Define allowed fields and mappings
        const allowedUserFields = ['name', 'email', 'isActive', 'isactive'];
        const allowedStudentFields = ['grade', 'level', 'guardianName', 'guardianContact'];

        Object.keys(updates).forEach(key => {
            // User table updates
            if (key === 'name' || key === 'email') {
                userUpdates[key] = updates[key];
            } else if (key === 'isActive' || key === 'isactive') {
                userUpdates['isActive'] = updates[key]; // Map to column name (unquoted creation -> lowercase isactive? no, quoted string in SQL 'isActive' -> isActive. Created unquoted -> isactive)
                // In 0001_init.sql: isActive boolean. Unquoted -> isactive.
                // So column is likely `isactive`.
                userUpdates['isactive'] = updates[key];
            } else if (key === 'status' && typeof updates.status === 'boolean') {
                userUpdates['isactive'] = updates.status;
            }

            // Student table updates
            else if (key === 'grade') {
                studentUpdates['grade'] = updates[key];
            } else if (key === 'level' || key === 'gradeLevel') {
                studentUpdates['grade'] = updates[key]; // Map to grade
            } else if (key === 'guardianName' || key === 'guardianname') {
                studentUpdates['guardianname'] = updates[key]; // Map to lowercase column
            } else if (key === 'guardianContact' || key === 'guardiancontact') {
                studentUpdates['guardiancontact'] = updates[key]; // Map to lowercase column
            } else if (key === 'dateOfBirth' || key === 'date_of_birth') {
                studentUpdates['date_of_birth'] = updates[key]; // Map to snake_case column
            }
        });

        if (Object.keys(userUpdates).length === 0 && Object.keys(studentUpdates).length === 0) {
            return new NextResponse('No valid updates provided', { status: 400 });
        }

        if (Object.keys(userUpdates).length > 0) {
            // Remove camelCase keys if they mistakenly got in and we want only verified ones, but our logic above constructs new obj
            userUpdates.updatedAt = new Date().toISOString();
            // Note: DB column might be updatedAt (camelCase) or updatedat? 
            // 0001_init.sql: updatedAt. Unquoted -> updatedat.
            // Using "updatedAt" (quoted keys) in JS object for Supabase client:
            // "The Supabase client ... converts ... to match your database columns."
            // If I send `updatedAt`, and column is `updatedat`, does it work? 
            // Usually safest to use lowercase if unquoted.
            const dbUserUpdates: any = { ...userUpdates };
            if (dbUserUpdates.isActive !== undefined) delete dbUserUpdates.isActive; // Ensure we only send 'isactive'

            // Actually, let's try sending what we constructed. The JS keys 'isactive', 'updatedAt' (this one is questionable).
            // Let's check init sql: `updatedAt timestamptz`. Unquoted -> `updatedat`.
            // So I should send `updatedat`.
            delete dbUserUpdates.updatedAt;
            dbUserUpdates.updatedat = new Date().toISOString();

            const { error } = await supabase
                .from('users')
                .update(dbUserUpdates)
                .eq('id', studentId)
                .eq('role', 'student');
            if (error) throw error;
        }

        if (Object.keys(studentUpdates).length > 0) {
            // studentUpdates already has lowercase keys for guardians
            const dbStudentUpdates: any = { ...studentUpdates };
            dbStudentUpdates.updatedat = new Date().toISOString();

            const { error } = await supabase
                .from('students')
                .update(dbStudentUpdates)
                .eq('user_id', studentId);
            if (error) throw error;
        }

        // Fetch updated data using the GET logic (join)
        const { data, error } = await supabase
            .from('users')
            .select(`
                *,
                students (
                    grade,
                    guardianname,
                    guardiancontact,
                    enrollment_date,
                    date_of_birth
                )
            `)
            .eq('id', studentId)
            .maybeSingle();

        if (error) throw error;
        if (!data) return new NextResponse('Student user not found', { status: 404 });

        const student = Array.isArray(data.students) ? data.students[0] : data.students;
        const flattenedData = {
            id: data.id,
            name: data.name,
            email: data.email,
            isActive: data.isactive ?? data.isActive,
            createdAt: data.createdat ?? data.createdAt,
            grade: student?.grade,
            guardianName: student?.guardianname ?? student?.guardianName,
            guardianContact: student?.guardiancontact ?? student?.guardianContact,
            enrollmentDate: student?.enrollment_date,
            dateOfBirth: student?.date_of_birth,
        };

        return NextResponse.json(flattenedData);

    } catch (error) {
        console.error('Error updating student:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ studentId: string }> }
) {
    try {
        const { studentId } = await params;
        const session = await getServerSession();
        if (!session || session.user?.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = createServerSupabase();

        // Delete from Auth users first
        const { error: authError } = await supabase.auth.admin.deleteUser(studentId);
        // We log but continue if auth user is missing (consistency)
        if (authError) console.error("Error deleting auth user:", authError);

        // Delete from public tables
        const { error: delStudentErr } = await supabase
            .from('students')
            .delete()
            .eq('user_id', studentId);
        if (delStudentErr) throw delStudentErr;

        const { error: delUserErr } = await supabase
            .from('users')
            .delete()
            .eq('id', studentId)
            .eq('role', 'student');
        if (delUserErr) throw delUserErr;

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting student:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}