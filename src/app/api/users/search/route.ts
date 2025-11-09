import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { createSSRUserSupabase } from '@/lib/supabase.server';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    const supabase = await createSSRUserSupabase();

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (error) {
      console.error('Error searching for user:', error);
      return NextResponse.json(
        { error: 'Failed to search for user' },
        { status: 500 }
      );
    }

    return NextResponse.json({ user });
  } catch (error: any) {
    console.error('Error in GET /api/users/search:', error);
    return NextResponse.json(
      { error: 'Failed to search for user', details: error.message },
      { status: 500 }
    );
  }
}

