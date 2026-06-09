import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkillName, microSkillDescription } = req.body;
  if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill name." });

  const prompt = `You are an expert MCAT tutor building 520+ scorers. Generate EXACTLY 3 original difficult MCQs targeting:
Micro-skill: "${microSkillName}" — ${microSkillDescription || ""}

Rules:
- 520+ difficulty, higher-order reasoning only.
- Use clinical scenarios or lab passages.
- Exactly 4 answer choices per question.
- Explain WHY EACH WRONG ANSWER IS WRONG, not just why the correct answer is right.
- correctAnswerIndex must be 0, 1, 2, or 3.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["drills"],
          properties: {
            drills: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["question", "options", "correctAnswerIndex", "explanation"],
                properties: {
                  passage: { type: Type.STRING },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswerIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    });
    res.json(JSON.parse((response.text || "{}").trim()));
  } catch (error: any) {
    console.error("drills error:", error);
    res.status(500).json({ error: error.message || "Drill generation failed." });
  }
}
