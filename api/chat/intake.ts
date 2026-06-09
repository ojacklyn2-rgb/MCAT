import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

function parseBase64Image(dataUrl: string) {
  const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;
  return { mimeType: matches[1], data: matches[2] };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text, image } = req.body;
  if (!text && !image) return res.status(400).json({ error: "Either wrong question text or screenshot is required." });

  let contents: any[] = [];
  if (image) {
    const imgData = parseBase64Image(image);
    if (imgData) contents.push({ inlineData: { mimeType: imgData.mimeType, data: imgData.data } });
  }

  const promptText = `You are an expert MCAT tutor and learning coach. The student is aiming for a 520+ MCAT.

The student has submitted a question they got wrong (their notes/context: "${text || "No additional context provided"}").

STEP 1 — ERROR ANALYSIS:
1. Identify the MCAT section (C/P, CARS, B/B, P/S).
2. Identify the EXACT micro-skill being tested — not the broad topic.
3. State WHY the student likely missed it — be brutally specific.
4. Explain the concept in plain language first, then layer complexity. Use analogies and clinical examples.
5. End with a Socratic question. Do NOT reveal the correct answer.

Return strictly in the requested JSON format.`;

  contents.push({ text: promptText });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["microSkillName", "microSkillDescription", "broadTopic", "conceptSummary", "socraticOpener"],
          properties: {
            microSkillName: { type: Type.STRING },
            microSkillDescription: { type: Type.STRING },
            broadTopic: { type: Type.STRING },
            conceptSummary: { type: Type.STRING },
            socraticOpener: { type: Type.STRING },
          },
        },
      },
    });
    res.json(JSON.parse((response.text || "{}").trim()));
  } catch (error: any) {
    console.error("intake error:", error);
    res.status(500).json({ error: error.message || "Intake analysis failed." });
  }
}
