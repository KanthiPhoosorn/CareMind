const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS = ['gemini-1.5-pro', 'gemini-1.5-flash'] as const;

export async function askGemini(prompt: string): Promise<string> {
  for (const model of MODELS) {
    try {
      const res = await fetch(`${BASE_URL}/${model}:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } catch {
      continue;
    }
  }
  throw new Error('All Gemini models failed');
}
