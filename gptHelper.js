
// gptHelper.js
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1', // OpenRouter's base URL
});

export async function getGPTRecommendation(prompt) {
  try {
    const chat = await openai.chat.completions.create({
      model: 'openai/gpt-3.5-turbo-0125', // Valid OpenRouter model
      messages: [
        { role: 'system', content: 'You are a helpful telecom assistant. Respond in a natural, friendly tone. Always justify your suggestions.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
    });

    return chat.choices[0].message.content.trim();
  } catch (err) {
    console.error('❌ GPT API Error:', err.message);
    return null;
  }
}
