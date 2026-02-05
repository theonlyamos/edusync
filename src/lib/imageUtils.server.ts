/**
 * Server-side utility to convert image URLs in generated code to base64 data URIs.
 * This runs on the server where CSP doesn't apply, bypassing browser restrictions.
 */

/**
 * Extract unique image URLs from code string
 * Matches any URL that looks like it could be an image
 */
function extractImageUrls(code: string): string[] {
    const urls = new Set<string>();

    // Pattern to match URLs in various contexts
    const urlPatterns = [
        // src="..." or src='...' or src: '...'
        /src\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
        // url("...") or url('...') or url(...)
        /url\s*\(\s*["']?(https?:\/\/[^)"']+)["']?\s*\)/gi,
        // Generic string containing http(s) URL
        /["'](https?:\/\/[^"']+)["']/gi,
    ];

    for (const pattern of urlPatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(code)) !== null) {
            const url = match[1];
            if (url) {
                try {
                    const urlObj = new URL(url);
                    const pathname = urlObj.pathname.toLowerCase();

                    // Check if URL has an image extension
                    const hasImageExtension = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?|$)/i.test(pathname);

                    // Check if URL has image-related query params (common in CDNs)
                    const hasImageParams = urlObj.searchParams.has('auto') ||
                        urlObj.searchParams.has('format') ||
                        urlObj.searchParams.has('w') ||
                        urlObj.searchParams.has('h') ||
                        urlObj.searchParams.has('fit') ||
                        urlObj.searchParams.has('crop') ||
                        urlObj.searchParams.has('quality') ||
                        urlObj.searchParams.has('q');

                    // Check if pathname suggests it's an image (photo, image, img in path)
                    const pathSuggestsImage = /\/(photo|image|img|picture|media|asset|upload)/i.test(pathname);

                    // Include URL if it looks like an image
                    if (hasImageExtension || hasImageParams || pathSuggestsImage) {
                        urls.add(url);
                    }
                } catch {
                    // Invalid URL, skip
                }
            }
        }
    }

    return Array.from(urls);
}

/**
 * Convert all image URLs in code to base64 data URIs (server-side)
 * @param code - The generated code containing image URLs
 * @returns The code with image URLs replaced by base64 data URIs
 */
export async function convertImageUrlsToBase64(code: string): Promise<string> {
    const urls = extractImageUrls(code);

    if (urls.length === 0) {
        return code;
    }

    // Fetch all images in parallel with a timeout
    const FETCH_TIMEOUT = 10000; // 10 seconds per image
    const MAX_IMAGES = 10;

    const urlsToProcess = urls.slice(0, MAX_IMAGES);

    const results = await Promise.allSettled(
        urlsToProcess.map(async (url) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            try {
                const response = await fetch(url, {
                    headers: {
                        'Accept': 'image/*',
                        'User-Agent': 'Mozilla/5.0 (compatible; ImageFetcher/1.0)',
                    },
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.warn(`[imageUtils.server] Failed to fetch image: ${url} (${response.status})`);
                    return { url, base64: null };
                }

                // Verify the response is actually an image
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.startsWith('image/')) {
                    console.warn(`[imageUtils.server] URL is not an image (${contentType}): ${url}`);
                    return { url, base64: null };
                }

                const arrayBuffer = await response.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');

                console.log(`[imageUtils.server] Successfully converted: ${url.substring(0, 60)}...`);
                return { url, base64: `data:${contentType};base64,${base64}` };
            } catch (err) {
                clearTimeout(timeoutId);
                console.warn(`[imageUtils.server] Error fetching image ${url}:`, err);
                return { url, base64: null };
            }
        })
    );

    // Replace URLs with base64 data URIs
    let processedCode = code;

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.base64) {
            const { url, base64 } = result.value;
            // Escape special regex characters in URL
            const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            processedCode = processedCode.replace(new RegExp(escapedUrl, 'g'), base64);
        }
    }

    return processedCode;
}
