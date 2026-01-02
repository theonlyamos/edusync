import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase.server';

export async function GET() {
    const supabase = createServerSupabase();
    try {
        const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error('Error fetching organizations:', error);
        return NextResponse.json(
            { error: 'Failed to fetch organizations' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    const supabase = createServerSupabase();
    try {
        const body = await request.json();
        const { name, description, owner_id } = body;

        if (!name || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Organization name is required' },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from('organizations')
            .insert({
                name: name.trim(),
                description: description?.trim() || null,
                owner_id: owner_id || null,
                credits: 0,
                total_credits_purchased: 0,
                total_credits_used: 0,
                is_active: true,
                settings: {}
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        console.error('Error creating organization:', error);
        return NextResponse.json(
            { error: 'Failed to create organization' },
            { status: 500 }
        );
    }
}
