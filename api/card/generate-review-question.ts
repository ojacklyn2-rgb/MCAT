import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkillName, microSkillDescription } = req.body;
  if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill." });

  const prompt = `Generate a single 520+ MCAT spaced-repetition question for:
"${microSkillName}" — ${microSkillDescription || ""}
Test from a different angle than standard practice. Exactly 4 choices. Explain why each wrong answer is wrong.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["passage", "question", "options", "correctAnswerIndex", "explanation"],
          properties: {
            passage: { type: Type.STRING },
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswerIndex: { type: Type.INTEGER },
            explanation: { type: Type.STRING },
          },
        },
      },
    });
    res.json(JSON.parse((response.text || "{}").trim()));
  } catch (error: any) {
    console.error("review error:", error);
    res.status(500).json({ error: error.message || "Review question failed." });
  }
}
