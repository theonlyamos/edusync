import { createServerSupabase } from "@/lib/supabase.server";

export async function getAssessments() {
    try {
        const supabase = createServerSupabase();
        const { data, error } = await supabase
            .from('assessments')
            .select('*')
            .order('createdAt', { ascending: false });
        if (error) {
            // If table doesn't exist yet, return empty list to avoid build failure
            if ((error as any)?.code === 'PGRST205') return [];
            throw error;
        }
        return data ?? [];
    } catch (error) {
        console.error("Error fetching assessments:", error);
        throw error;
    }
}

export async function getAssessmentById(id: string) {
    try {
        const supabase = createServerSupabase();
        const { data, error } = await supabase
            .from('assessments')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error("Error fetching assessment:", error);
        throw error;
    }
}

export async function createAssessment(assessmentData: any) {
    try {
        const supabase = createServerSupabase();
        const payload = {
            ...assessmentData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        const { data, error } = await supabase
            .from('assessments')
            .insert(payload)
            .select('*')
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error("Error creating assessment:", error);
        throw error;
    }
}

export async function updateAssessment(id: string, assessmentData: any) {
    try {
        const supabase = createServerSupabase();
        const { data, error } = await supabase
            .from('assessments')
            .update({ ...assessmentData, updatedAt: new Date().toISOString() })
            .eq('id', id)
            .select('*')
            .maybeSingle();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error("Error updating assessment:", error);
        throw error;
    }
}

export async function deleteAssessment(id: string) {
    try {
        const supabase = createServerSupabase();
        const { error } = await supabase
            .from('assessments')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error("Error deleting assessment:", error);
        throw error;
    }
}

export async function getAssessmentResults() {
    try {
        const supabase = createServerSupabase();
        const { data, error } = await supabase
            .from('assessment_results')
            .select('*, assessment:assessments(*), student:users(name, email)');
        if (error) throw error;
        return data ?? [];
    } catch (error) {
        console.error("Error fetching assessment results:", error);
        throw error;
    }
}

export async function submitAssessment(
    assessmentId: string,
    studentId: string,
    answers: any[],
    score: number
) {
    try {
        const supabase = createServerSupabase();
        const payload = {
            assessmentId,
            studentId,
            answers,
            score,
            submittedAt: new Date().toISOString(),
        } as any;
        const { data, error } = await supabase
            .from('assessment_results')
            .insert(payload)
            .select('*')
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error("Error submitting assessment:", error);
        throw error;
    }
}
