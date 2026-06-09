import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { history, microSkill, latestMessage } = req.body;
  if (!latestMessage) return res.status(400).json({ error: "Missing latest student message." });

  const formattedHistory = (history || []).map((msg: any) =>
    `${msg.sender === "user" ? "Student" : "Coach"}: ${msg.text}`
  ).join("\n");

  const prompt = `You are an expert MCAT tutor building 520+ scorers.
Micro-skill: "${microSkill?.name || "MCAT High-Yield Principle"}" — ${microSkill?.description || ""}

Dialogue so far:
${formattedHistory}

Latest student message: "${latestMessage}"

Rules: Never give the direct answer. Use Socratic questions. Switch analogies if they struggle twice. Only set readyForMastery to true for genuine mechanistic understanding, not surface recall. Be direct and rigorous.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["assistantMessage", "readyForMastery"],
          properties: {
            assistantMessage: { type: Type.STRING },
            readyForMastery: { type: Type.BOOLEAN },
          },
        },
      },
    });
    res.json(JSON.parse((response.text || "{}").trim()));
  } catch (error: any) {
    console.error("message error:", error);
    res.status(500).json({ error: error.message || "Dialogue failed." });
  }
}
