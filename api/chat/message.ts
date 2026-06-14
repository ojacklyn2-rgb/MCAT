import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { history, microSkill, latestMessage, originalQuestion } = req.body;
  if (!latestMessage) return res.status(400).json({ error: "Missing latest student message." });

  const formattedHistory = (history || []).map((msg: any) =>
    `${msg.sender === "user" ? "Student" : "Coach"}: ${msg.text}`
  ).join("\n");

  const anchorContext = originalQuestion
    ? `\n\nANCHOR — The original question the student got wrong:\n"${originalQuestion}"\n\nStay focused on THIS question's concept. Do not ask about unrelated topics.`
    : "";

  const systemPrompt = `You are an expert MCAT Socratic tutor building 520+ scorers. You MUST respond with valid JSON only.

Rules:
- ALWAYS stay anchored to the specific concept from the original question.
- Never give the direct answer. Guide the student to discover it themselves.
- Use analogies and clinical examples relevant to the specific concept being tested.
- Switch approach if they struggle twice in a row.
- Only set readyForMastery to true when the student demonstrates genuine mechanistic understanding.${anchorContext}

Return this exact JSON:
{
  "assistantMessage": "your Socratic response here",
  "readyForMastery": false
}`;

  const userPrompt = `Micro-skill: "${microSkill?.name || "MCAT concept"}" — ${microSkill?.description || ""}

Dialogue so far:
${formattedHistory}

Student just said: "${latestMessage}"

Respond with JSON only.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    res.json(JSON.parse(completion.choices[0].message.content || "{}"));
  } catch (error: any) {
    console.error("message error:", error);
    res.status(500).json({ error: error.message || "Dialogue failed." });
  }
}
