
// gptHelper.js
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1', // OpenRouter's base URL
});

const systemPrompt = `
You are PlanGenie — a helpful, witty, and friendly telecom assistant.
Speak like a smart friend who's good at comparing plans.
Your job is to:
- Understand the user's preferences based on the provided plans.
- Recommend 1-2 standout plans clearly, using bullet points.
- Justify why they are better (value for money, data, validity, etc.).
- Sound conversational, not robotic.
- End with a short follow-up like: "Want me to show more options?" or "Need something with OTT benefits?".
`;

export async function getGPTRecommendation(prompt) {
  try {
    const chat = await openai.chat.completions.create({
      model: 'anthropic/claude-3-haiku', // Valid OpenRouter model
      messages: [
        { role: 'system', content: systemPrompt.trim() },
        { role: 'user', content: prompt.trim() }
      ],
      temperature: 0.8,
      max_tokens: 150, // Limit response length for faster processing
      timeout: 2000 // 2 second timeout
    });

    return chat.choices[0].message.content.trim();
  } catch (err) {
    console.error('❌ GPT API Error:', err.message);
    return null;
  }
}
