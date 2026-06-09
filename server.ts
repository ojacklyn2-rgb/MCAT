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
You are an elite, highly technical Socratic MCAT coach. Your target audience is exceptional premeds aiming for a 520+ MCAT score.

The student has uploaded a struggle/incorrect question (potentially with text they provided: "${text || "No user comments provided"}").

Perform these actions carefully:
1. Identify the exact underlying Micro-Skill Gap (e.g., "Logarithmic approximations of pH using Henderson-Hasselbalch under time constraints", "Distinguishing physical vs coordinate covalent bonds in transition metal complexes", "Thermodynamic vs kinetic control of aldol condensations"). NOT broad topics.
2. Formulate a rich, plain-language concept analogy or concrete clinical/physiological example. Lay down a foundation of intuitive plain-language explanation first, then incrementally stack rigorous chemical, biological, or physical terms.
3. Write a sharp, demanding Socratic opener that prompts the student to explain a core prerequisite variable back to you. Do NOT reveal the correct answers to the input question; instead, guide them towards realizing the underlying error themselves.

Return your analysis strictly in the requested JSON format.
`;

    contents.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
You are a master MCAT Socratic Coach aiming to build 520+ scorers.
We are targeting the micro-skill: "${microSkill?.name || "MCAT High-Yield Principle"}" - Description: "${microSkill?.description || ""}".

Dialogue Context so far:
${formattedHistory}

Latest Student Input:
"${latestMessage}"

Your goals:
1. Provide a Socratic reply that continues helping the student earn full concept mastery.
2. Use analogies, clinical frameworks, Socratic guidance, or simple counter-questions.
3. NEVER tell them the direct answer or list of facts. Keep them in the driver's seat by probing their core assumptions.
4. If they have demonstrated complete, bulletproof conceptual understanding of this micro-skill and resolved their original mistake, set readyForMastery to true. Otherwise, keep it false.

Return your response strictly in the JSON format specified.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
Generate EXACTLY 3 challenging, premium-grade MCAT practice questions (options A, B, C, D) targeting this precise micro-skill:
Topic: "${microSkillName}"
Description: "${microSkillDescription || ""}"

Requirements:
- Target Difficulty: Extremely hard (520+ scale). These must require critical reasoning rather than simple rote memorization.
- Leverage real-life clinical scenarios, physiological pathways, or biochemistry lab-techniques as experimental passages where possible.
- Each item must have exactly 4 options.
- The correctAnswerIndex must be an integer from 0 to 3.
- Provide a rigorous, step-by-step master rationalization explaining the chemical/biological logic of why the correct option is true and why each of the other three distractors is false (ideal for active, high-yield learning).

Return your generated questions in the specified JSON schema.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
You are a very strict MCAT conceptual judge.
The student has finished their drills and is drafting a custom flashcard.
To prove they genuinely understand, they have explained the core concept in their own terms:

Micro-Skill: "${microSkillName}"
Description: ${microSkillDescription || ""}

Student's Written Explanation:
"${explanation}"

Verify their explanation strictly.
Is it scientifically accurate? Does it address the core micro-skill? Is it free of fundamental misconceptions?
Provide a brief Socratic critique (2-3 sentences), highlighting what they explained nicely or any missing variables.
Then, boolean isAccurate set to true ONLY if their explanation indicates clear, non-delusional understanding. If they are brief but capture the essential physiological/chemical mechanic, it is okay. If they have serious inaccuracies or wrote junk, set isAccurate to false.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
Generate a single, extremely difficult MCAT practice question (options A, B, C, D) to test active retention for this concept:
Topic: "${microSkillName}"
Description: "${microSkillDescription || ""}"

Requirements:
- Difficulty: 520+ level (experimental or clinical rationale).
- Must have exactly 4 choices (A, B, C, D).
- Return a detailed master explanation.

Return strictly in the requested JSON structure.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
Generate EXACTLY 5 difficult, high-yield MCAT prep questions testing these concepts under a strict interleaved layout:
Concepts available:
${skillsListStr}

Rules:
- Generate 5 questions in total.
- You must deliberately mix topics based on the concepts provided. Never have two consecutive questions testing the same micro-skill topic (unless you have fewer than 2 topics in the list, in which case spread them as much as possible).
- All questions must be strictly 520+ MCAT clinical/lab reasoning level.
- Each must have exactly 4 options.
- Identify which micro-skill is tested in each question using its name.

Return response strictly formatted as the JSON array of questions.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
