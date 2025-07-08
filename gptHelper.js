
// gptHelper.js
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // set this in Secrets tab
});

export async function getGPTRecommendation(prompt) {
  try {
    const chat = await openai.chat.completions.create({
      model: 'gpt-4', // you can also use 'gpt-3.5-turbo'
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
