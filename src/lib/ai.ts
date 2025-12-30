import OpenAI from 'openai';

interface OpenAIConfig {
    baseURL: string;
    apiKey: string;
    defaultHeaders?: Record<string, string>;
}

export async function generateAICompletion(
    systemPrompt: string,
    userPrompt: string,
    functions?: OpenAI.Chat.Completions.ChatCompletionCreateParams.Function[],
    json: boolean = false,
    temperature: number = 0.7
) {
    const AI_PROVIDER = 'GEMINI';
    const PROVIDER_BASE_URL = process.env[`${AI_PROVIDER}_BASE_URL`] || '';
    const PROVIDER_API_KEY = process.env[`${AI_PROVIDER}_API_KEY`];
    const PROVIDER_MODEL = process.env[`${AI_PROVIDER}_MODEL`];
    let HELICONE_BASE_URL = process.env.HELICONE_BASE_URL || '';
    const HELICONE_API_KEY = process.env.HELICONE_API_KEY;
    HELICONE_BASE_URL = HELICONE_BASE_URL + 'beta';

    const openaiConfig: OpenAIConfig = {
        baseURL: HELICONE_BASE_URL,
        apiKey: PROVIDER_API_KEY as string,
        defaultHeaders: {
            "Helicone-Auth": `Bearer ${HELICONE_API_KEY}`,
            "Helicone-Target-Url": PROVIDER_BASE_URL,
            "Helicone-Target-Provider": AI_PROVIDER,
        }
    };





    const openai = new OpenAI(openaiConfig);

    const response = await openai.chat.completions.create({
        model: PROVIDER_MODEL as string,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        functions,
        temperature,
        response_format: json ? { type: "json_object" } : undefined,
    });

    return response.choices[0].message.content;
}
