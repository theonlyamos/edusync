import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

export async function fetchUrlContent(url: string) {
    try {
        // First, fetch the content using Tavily API
        const response = await fetch('https://api.tavily.com/content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': TAVILY_API_KEY!,
            },
            body: JSON.stringify({
                url,
                include_images: false,
                include_links: true,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to fetch URL content');
        }

        const data = await response.json();

        // Convert the content to markdown format
        const markdown = `# ${data.title}\n\n${data.content}\n\n## Source\n${url}`;

        // Create unique filename
        const filename = `${uuidv4()}.md`;

        // Save to public/uploads directory
        const uploadDir = join(process.cwd(), 'public', 'uploads');
        const filePath = join(uploadDir, filename);

        await writeFile(filePath, markdown);

        return {
            fileUrl: `/uploads/${filename}`,
            filename: data.title,
            originalUrl: url
        };
    } catch (error) {
        console.error('Error fetching URL content:', error);
        throw error;
    }
} 