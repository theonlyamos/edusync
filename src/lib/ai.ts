import type OpenAI from 'openai';
import { getAiModels, getChatClient, requireModel } from '@/lib/ai-models.server';

/**
 * One chat completion for the app's text features (lesson drafts, co-author,
 * homework, practice, the text tutor, lesson artifacts). The provider and model
 * come from the admin panel's AI models page, falling back to env vars.
 */
export async function generateAICompletion(
    systemPrompt: string,
    userPrompt: string,
    functions?: OpenAI.Chat.Completions.ChatCompletionCreateParams.Function[],
    json: boolean = false,
    temperature: number = 0.7
) {
    const { text } = await getAiModels();
    const model = requireModel('text', text.provider, text.model);

    const response = await getChatClient(text.provider).chat.completions.create({
        model,
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
