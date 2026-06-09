import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SECTION_CONTEXT: Record<string, {
  label: string;
  passageLabel: string;
  passageInstructions: string;
  questionInstructions: string;
}> = {
  CP: {
    label: "Chemical and Physical Foundations (C/P)",
    passageLabel: "Research Passage",
    passageInstructions: `Write a 400-600 word research experiment passage about chemistry or physics. Include:
- Specific numerical data (concentrations, pH values, rate constants, voltages, pressures, temperatures, wavelengths)
- Experimental setup and methodology in detail
- Results with measurements and observations
- Multiple paragraphs covering background theory, procedure, and findings
Topics: general chemistry, organic chemistry, biochemistry, thermodynamics, electrochemistry, acid-base chemistry, kinetics, optics, fluid dynamics, lab techniques, spectroscopy.
DO NOT write a clinical patient case. This must be a laboratory/research experiment.`,
    questionInstructions: `Questions must require combining passage data with outside MCAT chemistry/physics/biochemistry knowledge. Include quantitative reasoning and unit analysis. Use AAMC stems like "Which of the following best explains...", "The researcher would most likely conclude...", "If X were changed to Y, the result would most likely be..."`
  },
  CARS: {
    label: "Critical Analysis and Reasoning Skills (CARS)",
    passageLabel: "CARS Passage",
    passageInstructions: `Write a 400-600 word CARS passage. This is a HUMANITIES or SOCIAL SCIENCE argumentative essay — NOT a science passage, NOT a clinical case, NOT a research experiment.
Choose ONE of these topic areas:
- Philosophy or ethics (e.g., moral theory, justice, epistemology)
- History or cultural analysis (e.g., historical movement, cultural shift)
- Art, literature, or music criticism (e.g., analysis of a genre or movement)
- Sociology or anthropology (e.g., social structures, cultural identity)
- Economics or political science (e.g., policy argument, economic theory)

The passage must:
- Present an author's clear argument or thesis
- Include supporting evidence, counterarguments, and rhetorical moves
- Be written in dense formal academic prose
- Have multiple paragraphs with developed reasoning
- CONTAIN ZERO science, medicine, biology, chemistry, or physics content`,
    questionInstructions: `Questions must test ONLY critical analysis and reasoning — never factual science recall. Use these AAMC CARS stems:
- "The author's primary purpose in this passage is..."
- "Which of the following most undermines the author's argument?"
- "The author mentions X primarily in order to..."
- "Based on the passage, the author would most likely agree that..."
- "The central claim of the passage is best described as..."`
  },
  BB: {
    label: "Biological and Biochemical Foundations (B/B)",
    passageLabel: "Research Passage",
    passageInstructions: `Write a 400-600 word biology or biochemistry research experiment passage. Include:
- Specific experimental conditions, gene names, protein functions, or enzyme activities
- Measured outcomes (expression levels, activity rates, phenotypes, yields)
- Detailed methodology and results across multiple paragraphs
- Background context connecting to broader biological concepts
Topics: molecular biology, genetics, gene expression, cell signaling, metabolism, enzyme kinetics, physiology, evolution, microbiology, biochemical pathways.
DO NOT write a clinical patient case.`,
    questionInstructions: `Questions must combine passage findings with outside MCAT biology/biochemistry knowledge. Include pathway reasoning and molecular mechanism analysis. Use AAMC stems like "Which of the following best explains...", "The researcher would most likely conclude...", "Which finding would most support the hypothesis that..."`
  },
  PS: {
    label: "Psychological, Social, and Biological Foundations of Behavior (P/S)",
    passageLabel: "Study Passage",
    passageInstructions: `Write a 400-600 word psychology or sociology research study passage. Include:
- Study design details (participants, conditions, controls, measurements)
- Quantitative or qualitative findings with specific data
- Discussion of behavioral or social patterns observed
- Multiple paragraphs with background theory, methods, results, and interpretation
Topics: learning and memory, cognition, emotion, motivation, development, social behavior, identity, culture, institutions, research methods, statistics, neuroscience of behavior.`,
    questionInstructions: `Questions must combine passage findings with outside MCAT psychology/sociology knowledge. Test application of theory, research design critique, and social/behavioral interpretation. Use AAMC stems like "Based on the passage, the researcher would most likely conclude...", "Which of the following theoretical frameworks best explains..."`
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkillName, microSkillDescription, section = "CP" } = req.body;
  if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill name." });

  const ctx = SECTION_CONTEXT[section] || SECTION_CONTEXT["CP"];

  const systemPrompt = `You are an AAMC MCAT question writer for the ${ctx.label} section. Generate exactly 1 passage with 5 questions. You MUST respond with valid JSON only — no markdown, no extra text.

PASSAGE REQUIREMENTS:
${ctx.passageInstructions}

QUESTION REQUIREMENTS:
${ctx.questionInstructions}

Additional rules:
- ALL 5 questions reference the SAME passage
- Wrong answer choices must be plausible — things students who partially understand the concept would choose
- NEVER reference any figures, graphs, images, tables, or visual aids. Text only.
- correctAnswerIndex must be 0, 1, 2, or 3

Return this exact JSON:
{
  "passageTitle": "Passage 1 (Questions 1–5)",
  "passage": "full 400-600 word passage text here",
  "drills": [
    {
      "questionNumber": 1,
      "question": "question stem",
      "options": ["A. option", "B. option", "C. option", "D. option"],
      "correctAnswerIndex": 0,
      "explanation": "Why the correct answer is right. Why each wrong answer is wrong. Reference specific passage details."
    },
    { "questionNumber": 2, "question": "...", "options": ["A.","B.","C.","D."], "correctAnswerIndex": 0, "explanation": "..." },
    { "questionNumber": 3, "question": "...", "options": ["A.","B.","C.","D."], "correctAnswerIndex": 0, "explanation": "..." },
    { "questionNumber": 4, "question": "...", "options": ["A.","B.","C.","D."], "correctAnswerIndex": 0, "explanation": "..." },
    { "questionNumber": 5, "question": "...", "options": ["A.","B.","C.","D."], "correctAnswerIndex": 0, "explanation": "..." }
  ]
}`;

  const userPrompt = `Generate a ${ctx.label} passage and 5 questions targeting this micro-skill:
"${microSkillName}" — ${microSkillDescription || ""}

CRITICAL: Follow the passage requirements exactly. The passage MUST be 400-600 words. Return valid JSON only.`;

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
    console.error("drills error:", error);
    res.status(500).json({ error: error.message || "Drill generation failed." });
  }
}
