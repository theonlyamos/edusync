import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, email, name, image, isActive, lastLogin, createdAt, updatedAt')
            .eq('role', 'admin')
            .order('createdAt', { ascending: false });
        if (error) throw error;
        return NextResponse.json(data ?? []);
    } catch (error) {
        console.error('Error fetching admins:', error);
        return NextResponse.json(
            { error: 'Failed to fetch admins' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, name } = body;

        const { data: existing, error: checkErr } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (checkErr) throw checkErr;
        if (existing) return NextResponse.json({ error: 'Email already exists' }, { status: 400 });

        const hashedPassword = await bcrypt.hash(password, 10);

        const { data, error } = await supabase
            .from('users')
            .insert({ email, password: hashedPassword, name, role: 'admin' })
            .select('id, email, name, role, image, isActive, lastLogin, createdAt, updatedAt')
            .single();
        if (error) throw error;
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error creating admin:', error);
        return NextResponse.json(
            { error: 'Failed to create admin' },
            { status: 500 }
        );
    }
} 