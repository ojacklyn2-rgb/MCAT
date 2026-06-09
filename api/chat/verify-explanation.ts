import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { explanation, microSkillName, microSkillDescription } = req.body;
  if (!explanation) return res.status(400).json({ error: "Missing explanation text." });

  const prompt = `You are a strict MCAT judge. Student aims for 520+.
Micro-Skill: "${microSkillName}" — ${microSkillDescription || ""}
Student's Explanation: "${explanation}"

Evaluate strictly:
- Incomplete/incorrect → isAccurate = false, state exactly what's missing.
- Surface-level only → isAccurate = false, push deeper with a hard follow-up.
- Only isAccurate = true for genuine mechanistic understanding.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["isAccurate", "critique"],
          properties: {
            isAccurate: { type: Type.BOOLEAN },
            critique: { type: Type.STRING },
          },
        },
      },
    });
    res.json(JSON.parse((response.text || "{}").trim()));
  } catch (error: any) {
    console.error("verify error:", error);
    res.status(500).json({ error: error.message || "Verification failed." });
  }
}
