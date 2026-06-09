import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up body parsers (generous limit for base64 screenshots)
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Initialize GenAI
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY environment variable is missing.");
}

const ai = new GoogleGenAI({
  apiKey: apiKey || "MOCK_KEY",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Helper: parse base64 image
function parseBase64Image(dataUrl: string) {
  const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return null;
  }
  return {
    mimeType: matches[1],
    data: matches[2],
  };
}

/* ==========================================================================
   API ENDPOINTS
   ========================================================================== */

// 1. Error Intake - Analyze pasted text or image
app.post("/api/chat/intake", async (req, res) => {
  try {
    const { text, image } = req.body;

    if (!text && !image) {
      return res.status(400).json({ error: "Either wrong question text or screenshot is required." });
    }

    let contents: any[] = [];

    if (image) {
      const imgData = parseBase64Image(image);
      if (imgData) {
        contents.push({
          inlineData: {
            mimeType: imgData.mimeType,
            data: imgData.data,
          },
        });
      }
    }

    const promptText = `
You are an expert MCAT tutor and learning coach. Your entire purpose is to turn the student's wrong answers into deep, durable mastery. The student is aiming for a 520+ MCAT. Never generate easy questions. Every drill must be difficult, nuanced, and require genuine higher-order reasoning — the kind the MCAT uses to separate top scorers from average ones.

The student has submitted a question they got wrong (their notes/context: "${text || "No additional context provided"}").

STEP 1 — ERROR ANALYSIS. Perform ALL of the following:
1. Identify the MCAT section (C/P, CARS, B/B, P/S).
2. Identify the EXACT micro-skill being tested — not the broad topic. Be as specific as possible (e.g., "Logarithmic approximation of pH using Henderson-Hasselbalch under time pressure", not "acid-base chemistry").
3. State WHY the student likely missed it — be brutally specific about the cognitive error or conceptual gap.
4. Identify the underlying concept gap this reveals.
5. Explain the concept in plain language first, then layer in complexity. Use analogies, text-described diagrams, and real biological or clinical examples to make abstract concepts concrete.
6. End with a Socratic follow-up question — never just give answers. Ask them to explain a core prerequisite back to you. Do NOT reveal the correct answer to their original question.

The student is aiming for 520+. Hold them to that standard. Be direct, rigorous, and encouraging without being soft.

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
            microSkillName: {
              type: Type.STRING,
              description: "Extremely focused, specific micro-skill name. Max 6-7 words.",
            },
            microSkillDescription: {
              type: Type.STRING,
              description: "Clear explanation of what the micro-skill is and why students struggle with it.",
            },
            broadTopic: {
              type: Type.STRING,
              description: "The overarching MCAT topic category (e.g., Chemistry/Physics - Solutions, Bio/Biochem - Enzyme Kinetics, Psych/Soc - Cognitive Theories).",
            },
            conceptSummary: {
              type: Type.STRING,
              description: "A beautiful, practice-oriented explanation. Starts with an analogy or clinical situation, and progressively layers high-yield complexity.",
            },
            socraticOpener: {
              type: Type.STRING,
              description: "A first message starting a Socratic dialogue. Probes their understanding or asks them to identify a specific relation in their wrong question.",
            },
          },
        },
      },
    });

    const bodyText = response.text || "{}";
    const result = JSON.parse(bodyText.trim());
    res.json(result);
  } catch (error: any) {
    console.error("Error in /api/chat/intake:", error);
    res.status(500).json({ error: error.message || "An error occurred during intake analysis." });
  }
});

// 2. Chat Message - Socratic dialogue coaching
app.post("/api/chat/message", async (req, res) => {
  try {
    const { history, microSkill, latestMessage } = req.body;

    if (!latestMessage) {
      return res.status(400).json({ error: "Missing latest student message." });
    }

    // Format chat context for Gemini
    const formattedHistory = (history || []).map((msg: any) => {
      return `${msg.sender === "user" ? "Student" : "Coach"}: ${msg.text}`;
    }).join("\n");

    const prompt = `
You are an expert MCAT tutor and learning coach building 520+ scorers. Your entire purpose is to turn wrong answers into deep, durable mastery.

Micro-skill being targeted: "${microSkill?.name || "MCAT High-Yield Principle"}"
Description: "${microSkill?.description || ""}"

Dialogue so far:
${formattedHistory}

Latest student message: "${latestMessage}"

Your coaching rules:
1. NEVER give the direct answer. Keep the student in the driver's seat by probing their assumptions with Socratic questions.
2. Use analogies, clinical frameworks, or text-described diagrams to reframe when they're stuck.
3. If they get something wrong twice in a row, switch your explanation approach entirely — use a different analogy, a clinical example, or a visual description.
4. Always explain in plain language first, then add complexity.
5. Never lower difficulty when the student struggles — change the explanation angle instead.
6. Surface recall is NOT enough for a 520. Only set readyForMastery to true if they demonstrate genuine mechanistic understanding — not just a correct guess or surface definition.
7. Be direct, rigorous, and encouraging without being soft.

Return your response strictly in the JSON format specified.
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
            assistantMessage: {
              type: Type.STRING,
              description: "Your Socratic feedback, micro-analogy, or guiding question.",
            },
            readyForMastery: {
              type: Type.BOOLEAN,
              description: "Set to true if and only if the student has actively explained the concept correctly, demonstrated a solid grasp of it, or clearly overcame the cognitive gap. Keep false if they are still struggling, guessing, or need more guiding.",
            },
          },
        },
      },
    });

    const result = JSON.parse((response.text || "{}").trim());
    res.json(result);
  } catch (error: any) {
    console.error("Error in /api/chat/message:", error);
    res.status(500).json({ error: error.message || "An error occurred during the dialogue session." });
  }
});

// 3. Generate Mastery Drills - 3 very difficult practice questions targeting the micro-skill gap.
app.post("/api/chat/generate-drills", async (req, res) => {
  try {
    const { microSkillName, microSkillDescription } = req.body;

    if (!microSkillName) {
      return res.status(400).json({ error: "Missing micro-skill name." });
    }

    const prompt = `
You are an expert MCAT tutor building 520+ scorers. Generate EXACTLY 3 original, difficult multiple choice questions targeting this exact micro-skill:

Micro-skill: "${microSkillName}"
Description: "${microSkillDescription || ""}"

STEP 2 — PRACTICE DRILLS requirements (follow every rule):
- Each question must be HARDER than a typical MCAT question — these must require genuine higher-order reasoning, not rote memorization.
- Never generate easy questions. Difficulty must remain at the level that separates 520+ scorers from average scorers.
- Use real clinical scenarios, physiological pathways, or biochemistry lab techniques as passages where appropriate.
- Each question must have exactly 4 answer choices (A, B, C, D).
- The correctAnswerIndex must be an integer from 0 to 3.
- Explanations must cover WHY EACH WRONG ANSWER IS WRONG — not just why the right answer is right. This is critical. Explain the exact reasoning flaw behind each distractor.
- Never repeat the same question structure or scenario across the 3 questions.

Return your generated questions in the specified JSON schema.
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
              description: "List of exactly 3 practice questions",
              items: {
                type: Type.OBJECT,
                required: ["question", "options", "correctAnswerIndex", "explanation"],
                properties: {
                  passage: {
                    type: Type.STRING,
                    description: "Optional research experiment, lab technique, or clinical passage. Max 200 words. Can be reused or null.",
                  },
                  question: {
                    type: Type.STRING,
                    description: "The core question targeting the micro-skill conceptual gap.",
                  },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Exactly 4 options representing choices A, B, C, and D.",
                  },
                  correctAnswerIndex: {
                    type: Type.INTEGER,
                    description: "0-based index of the correct answer (0 = A, 1 = B, 2 = C, 3 = D).",
                  },
                  explanation: {
                    type: Type.STRING,
                    description: "Detailed high-yield breakdown of why the correct answer is right and why each wrong helper is incorrect.",
                  },
                },
              },
            },
          },
        },
      },
    });

    const result = JSON.parse((response.text || "{}").trim());
    res.json(result);
  } catch (error: any) {
    console.error("Error in /api/chat/generate-drills:", error);
    res.status(500).json({ error: error.message || "An error occurred generating mastery drills." });
  }
});

// 4. Verify Student Explanation - Evaluate explanation before creating flashcard
app.post("/api/chat/verify-explanation", async (req, res) => {
  try {
    const { explanation, microSkillName, microSkillDescription } = req.body;

    if (!explanation) {
      return res.status(400).json({ error: "Missing explanation text." });
    }

    const prompt = `
You are a very strict MCAT conceptual judge evaluating a student aiming for 520+.

STEP 3 — FLASHCARD CREATION verification. The student has been asked to "explain it back to me in your own words like you're teaching someone who has never heard of it." Evaluate strictly:

Micro-Skill: "${microSkillName}"
Description: "${microSkillDescription || ""}"

Student's Explanation:
"${explanation}"

Evaluation rules — apply ALL of them:
1. Incomplete or incorrect → identify EXACTLY what is missing, set isAccurate to false.
2. Correct but surface-level → identify what deeper layer is missing, set isAccurate to false with a hard follow-up question pushing them deeper.
3. Only confirm (isAccurate = true) when you are GENUINELY satisfied they understand the mechanistic concept — not just a surface definition.

Surface recall is NOT enough for a 520. A student who says "competitive inhibitors increase Km" without explaining WHY (competing for active site, can be outcompeted at high substrate) has not demonstrated mastery.

Provide a critique that is direct and specific (2-3 sentences). Do not be encouraging if they got it wrong — tell them exactly what is missing.
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
            isAccurate: {
              type: Type.BOOLEAN,
              description: "Whether the explanation shows genuine concept mastery.",
            },
            critique: {
              type: Type.STRING,
              description: "Direct feedback on their explanation, summarizing what is missing or celebrating solid mastery.",
            },
          },
        },
      },
    });

    const result = JSON.parse((response.text || "{}").trim());
    res.json(result);
  } catch (error: any) {
    console.error("Error in /api/chat/verify-explanation:", error);
    res.status(500).json({ error: error.message || "An error occurred verifying explanation." });
  }
});

// 5. Spaced Repetition Review Question - Generate a fresh MCQ on a mastered concept
app.post("/api/card/generate-review-question", async (req, res) => {
  try {
    const { microSkillName, microSkillDescription } = req.body;

    if (!microSkillName) {
      return res.status(400).json({ error: "Missing concepts topic." });
    }

    const prompt = `
You are an expert MCAT tutor building 520+ scorers. Generate a single spaced-repetition review question for a concept the student has already mastered.

Micro-skill: "${microSkillName}"
Description: "${microSkillDescription || ""}"

Requirements:
- Difficulty: 520+ level — use experimental or clinical rationale, not rote recall.
- The question must test the concept from a DIFFERENT ANGLE than standard practice — force genuine retrieval, not pattern matching.
- Exactly 4 choices (A, B, C, D).
- Explanation must cover why each wrong answer is wrong, not just why the correct answer is right.

Return strictly in the requested JSON structure.
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
            passage: { type: Type.STRING, description: "Passage or lab technique or medical scenario context (around 150 words)." },
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exactly 4 options" },
            correctAnswerIndex: { type: Type.INTEGER, description: "Index 0 to 3" },
            explanation: { type: Type.STRING, description: "Detailed high-yield diagnostic explanation of right/wrong answers." },
          },
        },
      },
    });

    const result = JSON.parse((response.text || "{}").trim());
    res.json(result);
  } catch (error: any) {
    console.error("Error in /api/card/generate-review-question:", error);
    res.status(500).json({ error: error.message || "An error occurred generating active recall review question." });
  }
});

// 6. Interleaving Quiz - Generate 5 mix-topic questions from mastered concepts
app.post("/api/quiz/generate-interleaved", async (req, res) => {
  try {
    const { microSkills } = req.body; // array of { name, description }

    if (!microSkills || !Array.isArray(microSkills) || microSkills.length === 0) {
      return res.status(400).json({ error: "Provide at least one mastered micro-skill to generate an interleaved quiz." });
    }

    // Prepare list
    const skillsListStr = microSkills.map((s: any, idx: number) => {
      return `${idx + 1}. Topic: "${s.name}" | Summary: "${s.description}"`;
    }).join("\n");

    const prompt = `
You are an expert MCAT tutor building 520+ scorers. Generate a 5-question interleaved quiz from the student's mastered concepts.

STEP 4 — INTERLEAVING QUIZ rules (follow every rule):
Mastered concepts available:
${skillsListStr}

Rules:
- Generate EXACTLY 5 questions.
- Mix topics DELIBERATELY — never two consecutive questions from the same micro-skill.
- All questions must be 520+ level — clinical reasoning, experimental passages, or physiological mechanisms. Never rote recall.
- Each question must have exactly 4 options.
- Difficulty must remain HIGH throughout. Do not ease up on later questions.
- Explanations must explain why each wrong answer is wrong — not just why the correct answer is right.
- Identify which micro-skill is tested in each question.

Return response strictly formatted as the JSON array of questions.
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
              description: "Array of exactly 5 interleaved questions",
              items: {
                type: Type.OBJECT,
                required: ["microSkill", "passage", "question", "options", "correctAnswerIndex", "explanation"],
                properties: {
                  microSkill: {
                    type: Type.STRING,
                    description: "Name of the micro-skill tested here. Must match one of the input topics.",
                  },
                  passage: {
                    type: Type.STRING,
                    description: "Experimental research or medical presentation scenario.",
                  },
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Exactly 4 standard options.",
                  },
                  correctAnswerIndex: { type: Type.INTEGER, description: "0-3 index." },
                  explanation: { type: Type.STRING, description: "Detailed clinical/mechanistic breakdown of why other choices are wrong." },
                },
              },
            },
          },
        },
      },
    });

    const result = JSON.parse((response.text || "{}").trim());
    res.json(result);
  } catch (error: any) {
    console.error("Error in /api/quiz/generate-interleaved:", error);
    res.status(500).json({ error: error.message || "An error occurred generating interleaved quiz." });
  }
});

/* ==========================================================================
   VITE & STATIC SERVER
   ========================================================================== */

// Integrate Vite DEV middlewear / Static Prod server
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Fullstack Server] running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
