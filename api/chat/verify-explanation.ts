import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { explanation, microSkillName, microSkillDescription } = req.body;
  if (!explanation) return res.status(400).json({ error: "Missing explanation text." });

  const systemPrompt = `You are a strict MCAT judge evaluating a 520+ student. You MUST respond with valid JSON only.

Return this exact JSON:
{
  "isAccurate": true or false,
  "critique": "direct 2-3 sentence feedback"
}

Be strict: surface recall = false. Only true for genuine mechanistic understanding.`;

  const userPrompt = `Micro-Skill: "${microSkillName}" — ${microSkillDescription || ""}
Student's explanation: "${explanation}"

Is this mechanistically accurate and complete? Return JSON only.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    res.json(JSON.parse(completion.choices[0].message.content || "{}"));
  } catch (error: any) {
    console.error("verify error:", error);
    res.status(500).json({ error: error.message || "Verification failed." });
  }
}
