import { createServerSupabase } from "@/lib/supabase.server";
import bcrypt from "bcryptjs";

interface CreateUserParams {
    email: string;
    password: string;
    name: string;
    role: 'admin' | 'teacher' | 'student';
}

interface CreateStudentParams extends CreateUserParams {
    grade: string;
    guardianName?: string;
    guardianContact?: string;
}

interface CreateTeacherParams extends CreateUserParams {
    subjects?: string[];
    grades?: string[];
    qualifications?: string[];
    specializations?: string[];
}

interface CreateAdminParams extends CreateUserParams {
    permissions?: string[];
    isSuperAdmin?: boolean;
}

export async function createStudent(params: CreateStudentParams) {
    try {
        const supabase = createServerSupabase();
        const hashedPassword = await bcrypt.hash(params.password, 10);
        const { data: user, error: userErr } = await supabase
            .from('users')
            .insert({ email: params.email, password: hashedPassword, name: params.name, role: 'student', createdAt: new Date().toISOString() })
            .select('*')
            .single();
        if (userErr) throw userErr;

        const { data: student, error: studentErr } = await supabase
            .from('students')
            .insert({ user_id: user.id, grade: params.grade, guardianName: params.guardianName, guardianContact: params.guardianContact })
            .select('*')
            .single();
        if (studentErr) throw studentErr;
        return { user, student };
    } catch (error) {
        throw error;
    }
}

export async function createTeacher(params: CreateTeacherParams) {
    try {
        const supabase = createServerSupabase();
        const hashedPassword = await bcrypt.hash(params.password, 10);
        const { data: user, error: userErr } = await supabase
            .from('users')
            .insert({ email: params.email, password: hashedPassword, name: params.name, role: 'teacher', createdAt: new Date().toISOString() })
            .select('*')
            .single();
        if (userErr) throw userErr;

        const { data: teacher, error: tErr } = await supabase
            .from('teachers')
            .insert({ user_id: user.id, subjects: params.subjects ?? [], grades: params.grades ?? [], qualifications: params.qualifications ?? [], specializations: params.specializations ?? [] })
            .select('*')
            .single();
        if (tErr) throw tErr;
        return { user, teacher };
    } catch (error: any) {
        // Best-effort rollback if user created but teacher failed
        try {
            const maybeUserId = (error?.user?._id) ?? undefined;
            if (maybeUserId) {
                const supabase = createServerSupabase();
                await supabase.from('users').delete().eq('id', maybeUserId);
            }
        } catch { }
        throw error;
    }
}

export async function createAdmin(params: CreateAdminParams) {
    try {
        const supabase = createServerSupabase();
        const hashedPassword = await bcrypt.hash(params.password, 10);
        const { data: user, error: userErr } = await supabase
            .from('users')
            .insert({ email: params.email, password: hashedPassword, name: params.name, role: 'admin', createdAt: new Date().toISOString() })
            .select('*')
            .single();
        if (userErr) throw userErr;

        const { data: admin, error: aErr } = await supabase
            .from('admins')
            .insert({ user_id: user.id, permissions: params.permissions ?? [], isSuperAdmin: params.isSuperAdmin ?? false })
            .select('*')
            .single();
        if (aErr) throw aErr;
        return { user, admin };
    } catch (error) {
        throw error;
    }
}

export async function getUserDetails(userId: string, role: string) {
    const supabase = createServerSupabase();
    const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
    if (!user) return null;

    let roleDetails: any = null;
    if (role === 'student') {
        const { data } = await supabase.from('students').select('*').eq('user_id', userId).maybeSingle();
        roleDetails = data;
    } else if (role === 'teacher') {
        const { data } = await supabase.from('teachers').select('*').eq('user_id', userId).maybeSingle();
        roleDetails = data;
    } else if (role === 'admin') {
        const { data } = await supabase.from('admins').select('*').eq('user_id', userId).maybeSingle();
        roleDetails = data;
    }

    return { ...user, ...roleDetails };
}

export async function updateUserPassword(userId: string, newPassword: string) {
    const supabase = createServerSupabase();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const { data, error } = await supabase
        .from('users')
        .update({ password: hashedPassword, updatedAt: new Date().toISOString() })
        .eq('id', userId)
        .select('*')
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function deactivateUser(userId: string) {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
        .from('users')
        .update({ isActive: false, updatedAt: new Date().toISOString() })
        .eq('id', userId)
        .select('*')
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function activateUser(userId: string) {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
        .from('users')
        .update({ isActive: true, updatedAt: new Date().toISOString() })
        .eq('id', userId)
        .select('*')
        .maybeSingle();
    if (error) throw error;
    return data;
}
