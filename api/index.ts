import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

function parseBase64Image(dataUrl: string) {
  const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;
  return { mimeType: matches[1], data: matches[2] };
}

// 1. Error Intake
app.post("/api/chat/intake", async (req, res) => {
  try {
    const { text, image } = req.body;
    if (!text && !image) return res.status(400).json({ error: "Either wrong question text or screenshot is required." });

    let contents: any[] = [];
    if (image) {
      const imgData = parseBase64Image(image);
      if (imgData) contents.push({ inlineData: { mimeType: imgData.mimeType, data: imgData.data } });
    }

    const promptText = `
You are an expert MCAT tutor and learning coach. Your entire purpose is to turn the student's wrong answers into deep, durable mastery. The student is aiming for a 520+ MCAT.

The student has submitted a question they got wrong (their notes/context: "${text || "No additional context provided"}").

STEP 1 — ERROR ANALYSIS. Perform ALL of the following:
1. Identify the MCAT section (C/P, CARS, B/B, P/S).
2. Identify the EXACT micro-skill being tested — not the broad topic. Be as specific as possible.
3. State WHY the student likely missed it — be brutally specific about the cognitive error or conceptual gap.
4. Explain the concept in plain language first, then layer in complexity. Use analogies and real biological or clinical examples.
5. End with a Socratic follow-up question. Do NOT reveal the correct answer to their original question.

Return your analysis strictly in the requested JSON format.
`;
    contents.push({ text: promptText });

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
});

// 2. Chat Message
app.post("/api/chat/message", async (req, res) => {
  try {
    const { history, microSkill, latestMessage } = req.body;
    if (!latestMessage) return res.status(400).json({ error: "Missing latest student message." });

    const formattedHistory = (history || []).map((msg: any) =>
      `${msg.sender === "user" ? "Student" : "Coach"}: ${msg.text}`
    ).join("\n");

    const prompt = `
You are an expert MCAT tutor building 520+ scorers.
Micro-skill: "${microSkill?.name || "MCAT High-Yield Principle"}" — ${microSkill?.description || ""}

Dialogue so far:
${formattedHistory}

Latest student message: "${latestMessage}"

Rules: Never give the direct answer. Use Socratic questions. Switch analogies if they struggle twice. Only set readyForMastery to true for genuine mechanistic understanding, not surface recall.
`;

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
});

// 3. Generate Drills
app.post("/api/chat/generate-drills", async (req, res) => {
  try {
    const { microSkillName, microSkillDescription } = req.body;
    if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill name." });

    const prompt = `
You are an expert MCAT tutor building 520+ scorers. Generate EXACTLY 3 original, difficult multiple choice questions targeting:
Micro-skill: "${microSkillName}" — ${microSkillDescription || ""}

Rules:
- 520+ difficulty, higher-order reasoning only, no rote memorization.
- Use clinical scenarios or lab passages.
- Exactly 4 answer choices per question.
- Explain WHY EACH WRONG ANSWER IS WRONG, not just why the correct answer is right.
`;

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
});

// 4. Verify Explanation
app.post("/api/chat/verify-explanation", async (req, res) => {
  try {
    const { explanation, microSkillName, microSkillDescription } = req.body;
    if (!explanation) return res.status(400).json({ error: "Missing explanation text." });

    const prompt = `
You are a strict MCAT conceptual judge. The student aims for 520+.
Micro-Skill: "${microSkillName}" — ${microSkillDescription || ""}
Student's Explanation: "${explanation}"

Evaluate strictly:
- Incomplete/incorrect → isAccurate = false, state exactly what's missing.
- Surface-level only → isAccurate = false, push deeper.
- Only isAccurate = true for genuine mechanistic understanding.
`;

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
});

// 5. SRS Review Question
app.post("/api/card/generate-review-question", async (req, res) => {
  try {
    const { microSkillName, microSkillDescription } = req.body;
    if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill." });

    const prompt = `
Generate a single 520+ level MCAT spaced-repetition question for:
"${microSkillName}" — ${microSkillDescription || ""}
Test from a different angle than standard practice. Exactly 4 choices. Explain why each wrong answer is wrong.
`;

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
    res.status(500).json({ error: error.message || "Review question generation failed." });
  }
});

// 6. Interleaved Quiz
app.post("/api/quiz/generate-interleaved", async (req, res) => {
  try {
    const { microSkills } = req.body;
    if (!microSkills || !Array.isArray(microSkills) || microSkills.length === 0)
      return res.status(400).json({ error: "Provide at least one mastered micro-skill." });

    const skillsListStr = microSkills.map((s: any, i: number) =>
      `${i + 1}. "${s.name}" — ${s.description}`
    ).join("\n");

    const prompt = `
Generate EXACTLY 5 interleaved MCAT questions from these mastered concepts:
${skillsListStr}

Rules: Mix topics — never two consecutive questions from the same skill. 520+ clinical/experimental difficulty. Explain why each wrong answer is wrong.
`;

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
});

export default app;
