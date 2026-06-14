import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text, image } = req.body;
  if (!text && !image) return res.status(400).json({ error: "Either wrong question text or screenshot is required." });

  const systemPrompt = `You are an expert MCAT tutor. Analyze the student's wrong answer and identify the exact micro-skill gap. You MUST respond with valid JSON only — no markdown, no extra text.

Return this exact JSON structure:
{
  "microSkillName": "specific 6-7 word micro-skill name",
  "microSkillDescription": "what the micro-skill is and why students struggle with it",
  "broadTopic": "MCAT section - Topic (e.g. Psych/Soc - Social Perception)",
  "conceptSummary": "2-3 sentence plain language explanation of the concept the student got wrong",
  "socraticOpener": "one targeted Socratic question probing WHY they got this specific question wrong — do NOT reveal the answer, do NOT ask about graphs or unrelated content"
}`;

  const userContent: any[] = [];

  if (image) {
    userContent.push({
      type: "image_url",
      image_url: { url: image }
    });
  }

  userContent.push({
    type: "text",
    text: `The student got this MCAT question wrong.${text ? ` Their note: "${text}"` : ""}\n\nLook at the screenshot carefully. Identify:\n1. The MCAT section (CP/CARS/BB/PS)\n2. The exact concept or mechanism being tested\n3. The likely micro-skill gap (not the broad topic)\n\nThen open a Socratic dialogue about THAT specific concept. Return valid JSON only.`
  });

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.2-11b-vision-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    res.json(result);
  } catch (error: any) {
    console.error("intake error:", error);
    res.status(500).json({ error: error.message || "Intake analysis failed." });
  }
}
