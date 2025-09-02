import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/lib/supabase';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabase
            .from('progress')
            .select('*, lesson:lessons(*)')
            .eq('studentId', session.user.id);
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error('Error fetching progress:', error);
        return NextResponse.json(
            { error: 'Failed to fetch progress' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { lessonId, completionStatus, timeSpent, quizScore } = await request.json();

        const upsertPayload: any = {
            studentId: session.user.id,
            lessonId,
            completionStatus,
            timeSpent,
            lastAccessed: new Date().toISOString()
        };

        const { data: existing } = await supabase
            .from('progress')
            .select('id, quizScores')
            .eq('studentId', session.user.id)
            .eq('lessonId', lessonId)
            .maybeSingle();

        if (quizScore) {
            const newScore = { quizId: quizScore.quizId, score: quizScore.score, attemptDate: new Date().toISOString() };
            if (existing?.quizScores) {
                upsertPayload.quizScores = [...existing.quizScores, newScore];
            } else {
                upsertPayload.quizScores = [newScore];
            }
        }

        let saved;
        if (existing) {
            const { data, error } = await supabase
                .from('progress')
                .update(upsertPayload)
                .eq('id', existing.id)
                .select('*')
                .maybeSingle();
            if (error) throw error;
            saved = data;
        } else {
            const { data, error } = await supabase
                .from('progress')
                .insert(upsertPayload)
                .select('*')
                .maybeSingle();
            if (error) throw error;
            saved = data;
        }

        return NextResponse.json(saved);
    } catch (error) {
        console.error('Error updating progress:', error);
        return NextResponse.json(
            { error: 'Failed to update progress' },
            { status: 500 }
        );
    }
}