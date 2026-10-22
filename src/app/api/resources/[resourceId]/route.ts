import { NextResponse, NextRequest } from 'next/server';
import { lessonArtifactErrorResponse } from '@/lib/lesson-artifacts/server';
import { requireContentManager } from '@/lib/lesson-content-server';

type Params = { params: Promise<{ resourceId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
    try {
        const { row } = await requireContentManager((await params).resourceId, 'resource');
        return NextResponse.json(row);
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
    try {
        const { db, row } = await requireContentManager((await params).resourceId, 'resource');
        const { error } = await db.from('lesson_content').delete().eq('id', row.id);
        if (error) throw error;
        return NextResponse.json({ message: 'Resource deleted' });
    } catch (error) {
        return lessonArtifactErrorResponse(error);
    }
}
