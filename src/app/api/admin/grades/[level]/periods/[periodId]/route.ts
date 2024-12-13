import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
// import { db } from '@/lib/db';

export async function PUT(
    request: Request,
    { params }: { params: { level: string; periodId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level, periodId } = await params;
        const decodedLevel = decodeURIComponent(level);
        const { startTime, endTime } = await request.json();
        if (!startTime || !endTime) {
            return new NextResponse('Missing required fields', { status: 400 });
        }

        const client = await connectToDatabase();
        const db = client.db();

        const period = await db.collection('timetables').updateOne(
            {
                level: decodedLevel,
                'periods.id': periodId
            },
            {
                $set: {
                    'periods.$.startTime': startTime,
                    'periods.$.endTime': endTime
                }
            }
        );

        return NextResponse.json(period);
    } catch (error) {
        console.error('[PERIOD_PUT]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { level: string; periodId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'admin') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { level, periodId } = await params;
        const decodedLevel = decodeURIComponent(level);
        const client = await connectToDatabase();
        const db = client.db();

        await db.collection('timetables').updateOne(
            { level: decodedLevel },
            { $pull: { periods: { id: periodId } } } as any
        );

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('[PERIOD_DELETE]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
} 