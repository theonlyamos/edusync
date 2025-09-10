import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'teacher') {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return new NextResponse('No file uploaded', { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Create unique filename
        const uniqueFilename = `${uuidv4()}-${file.name}`;

        // Save to public/uploads directory
        const uploadDir = join(process.cwd(), 'public', 'uploads');
        const filePath = join(uploadDir, uniqueFilename);

        await writeFile(filePath, buffer);

        // Return the URL path that can be used to access the file
        const fileUrl = `/uploads/${uniqueFilename}`;

        return NextResponse.json({
            url: fileUrl,
            filename: file.name,
            size: file.size,
            type: file.type
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 