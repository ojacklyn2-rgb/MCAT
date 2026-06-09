import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkills } = req.body;
  if (!microSkills || !Array.isArray(microSkills) || microSkills.length === 0)
    return res.status(400).json({ error: "Provide at least one mastered micro-skill." });

  const skillsListStr = microSkills.map((s: any, i: number) =>
    `${i + 1}. "${s.name}" — ${s.description}`
  ).join("\n");

  const prompt = `Generate EXACTLY 5 interleaved 520+ MCAT questions from these mastered concepts:
${skillsListStr}

Rules: Mix topics — never two consecutive questions from the same skill. Clinical/experimental difficulty. Explain why each wrong answer is wrong.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["questions"],
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["microSkill", "passage", "question", "options", "correctAnswerIndex", "explanation"],
                properties: {
                  microSkill: { type: Type.STRING },
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
    console.error("quiz error:", error);
    res.status(500).json({ error: error.message || "Quiz generation failed." });
  }
}
