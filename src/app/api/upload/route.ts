import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadSchema, sanitizeFilename, validateFileExtension, MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from '@/lib/validation/upload';
import { createHash } from 'crypto';

export async function POST(req: Request) {
    try {
        const session = await getServerSession();
        if (!session || session.user?.role !== 'teacher') {
            return NextResponse.json(
                { error: 'Unauthorized: Only teachers can upload files' },
                { status: 401 }
            );
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json(
                { error: 'No file uploaded' },
                { status: 400 }
            );
        }

        // Validate file metadata
        const validation = uploadSchema.safeParse({
            filename: file.name,
            size: file.size,
            type: file.type,
        });

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid file', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        // Additional validation for file extension
        if (!validateFileExtension(file.name, file.type)) {
            return NextResponse.json(
                { error: 'File extension does not match file type' },
                { status: 400 }
            );
        }

        // Check file size again (defense in depth)
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
                { status: 400 }
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Generate file hash for integrity check
        const hash = createHash('sha256').update(buffer).digest('hex');

        // Sanitize filename and create unique name
        const sanitizedName = sanitizeFilename(file.name);
        const ext = sanitizedName.split('.').pop();
        const uniqueFilename = `${uuidv4()}-${hash.substring(0, 8)}.${ext}`;

        // Create upload directory structure (organized by date)
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const uploadDir = join(process.cwd(), 'uploads', 'secure', year.toString(), month);

        // Ensure directory exists
        await mkdir(uploadDir, { recursive: true });

        const filePath = join(uploadDir, uniqueFilename);

        // Write file to secure location (not in public directory)
        await writeFile(filePath, buffer);

        // Store file metadata in database (you should implement this)
        // This would include: user_id, original_name, stored_name, hash, size, type, upload_date

        // Return file information (without exposing internal path)
        return NextResponse.json({
            id: uuidv4(), // File ID for retrieval
            filename: sanitizedName,
            size: file.size,
            type: file.type,
            hash: hash.substring(0, 16), // Partial hash for verification
            uploadedAt: date.toISOString(),
            uploadedBy: session.user.id
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        return NextResponse.json(
            { error: 'Failed to upload file' },
            { status: 500 }
        );
    }
} 