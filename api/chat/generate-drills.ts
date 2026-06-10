import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── SHARED AAMC QUESTION ENGINEERING RULES ───────────────────────────────────
// Injected into every section's prompt. These are the rules that separate real
// AAMC questions from generic AI questions.
const AAMC_QUESTION_RULES = `
═══════════════════════════════════════════
AAMC QUESTION ENGINEERING — MANDATORY RULES
═══════════════════════════════════════════

RULE 1 — NEVER WRITE BASIC RECALL.
Banned question types: "What is X?", "Which defines X?", "What does X mean?", "X is best described as..."
Every question must require REASONING, not memory retrieval.

RULE 2 — PASSAGE + OUTSIDE KNOWLEDGE FUSION.
At least 3 of 5 questions must be UNSOLVABLE without combining a specific detail from the passage
(a number, condition, finding, or quote) with outside MCAT content knowledge. Neither alone is enough.

RULE 3 — QUESTION TYPE DISTRIBUTION (enforce all 5 across the set):
  Q1: TWO-STEP REASONING — Student must derive intermediate conclusion A from passage, then apply
      outside concept B to reach final answer. Example: "The result in paragraph 3 suggests X.
      Given that X occurs under condition Y, the most likely outcome is..."
  Q2: HYPOTHETICAL / EXPERIMENTAL PERTURBATION — "If [specific passage variable] were [changed],
      the result would most likely be..." Forces transfer of mechanism to modified scenario.
  Q3: EXCEPT or LEAST question — "All of the following are consistent with the findings EXCEPT..."
      or "Which would LEAST support the researcher's conclusion?" Student must evaluate all 4 options.
  Q4: MECHANISM / EXPLANATION — "Which of the following best explains WHY [specific passage result]
      occurred?" Requires identifying the underlying cause, not just re-stating the result.
  Q5: INFERENCE / IMPLICATION — "Based on the passage, which conclusion is most strongly supported?"
      or "The researcher's findings suggest that..." Tests whether student can draw the right inference
      without over-reaching beyond what the data supports.

RULE 4 — DISTRACTOR ENGINEERING (most important rule).
Each wrong answer must exploit a SPECIFIC, NAMED student error. For every question, assign each
wrong answer one of these distractor types:
  [REVERSAL]     — Student swaps cause and effect, or direction of change (increases vs decreases).
  [PARTIAL]      — Student knows the first step of the mechanism but not the second.
  [SCOPE ERROR]  — Correct concept but applied to the wrong variable, molecule, or condition.
  [CONFLATION]   — Student confuses two similar concepts (e.g., Km vs Vmax, galvanic vs electrolytic).
  [ATTRACTIVE]   — Uses correct MCAT vocabulary and sounds plausible, but gets the mechanism wrong.
  [OVERGENERALIZATION] — True in one context but not in the specific conditions the passage describes.

Wrong answers must NOT be obviously wrong. A student who studied but has a subtle misconception
should find each wrong answer genuinely tempting.

RULE 5 — ANSWER CHOICE CRAFTING.
- All 4 options must be grammatically parallel.
- Avoid options that are clearly longer or more detailed than the others (giveaway).
- Do NOT use "All of the above" or "None of the above."
- Rotate correctAnswerIndex across questions (do not cluster correct answers at index 0 or 1).
- Correct answer must be unambiguously correct — no "best of two plausible" situations.

RULE 6 — EXPLANATION FORMAT (required for every question):
"CORRECT (index X): [Why this is correct — cite specific passage detail + outside concept used].
WRONG A [distractor type]: [Exactly which misconception this exploits and why it's wrong].
WRONG B [distractor type]: [Exactly which misconception this exploits and why it's wrong].
WRONG C [distractor type]: [Exactly which misconception this exploits and why it's wrong]."
Replace A/B/C with whichever 3 are the wrong options.

RULE 7 — NO VISUAL AIDS. Never reference figures, tables, graphs, or images. Text-only passage.
`;

const SECTION_CONTEXT: Record<string, { label: string; passageInstructions: string; questionInstructions: string }> = {
  CP: {
    label: "Chemical and Physical Foundations (C/P)",
    passageInstructions: `Write a rigorous chemistry or physics research experiment passage (400–600 words, 5–6 paragraphs).
P1 (background, ~80w): Introduce the scientific concept and its theoretical significance.
P2 (prior work, ~80w): Relevant prior research or theoretical framework; name specific equations or constants used.
P3 (methods, ~100w): Precise experimental setup — named reagents with concentrations, specific temperatures, instrument names, control conditions.
P4 (results, ~100w): Quantitative findings — include specific numbers, rates, or ratios that questions can reference. Include at least one unexpected or counterintuitive result.
P5 (analysis, ~90w): Mechanistic interpretation — explain WHY the results occurred at the molecular/atomic level.
P6 (conclusion, ~60w): Broader implication or one unanswered question raised by the data.

Topics: general chemistry, organic chemistry, biochemistry, thermodynamics, electrochemistry, acid-base equilibria, kinetics, optics, fluid dynamics, spectroscopy.
PROHIBITED: clinical patient cases, diagnosis, treatment, medical symptoms.`,
    questionInstructions: `C/P QUESTION REQUIREMENTS:
- At least 2 questions must require mathematical reasoning or unit analysis using passage numbers.
- At least 1 question must test a concept NOT explicitly stated in the passage (outside knowledge required).
- For the EXCEPT question: make 3 of the options clearly derivable from the passage and 1 subtly inconsistent.
- Hypothetical question must change a specific numerical value or condition from the passage.`
  },
  CARS: {
    label: "Critical Analysis and Reasoning Skills (CARS)",
    passageInstructions: `Write a sophisticated CARS humanities or social science argumentative essay (450–600 words, 5–6 paragraphs).
P1 (thesis, ~80w): The author's central argument — specific, debatable, not a mere observation.
P2 (intellectual context, ~90w): Historical, philosophical, or cultural background; name specific thinkers, movements, or events the author responds to.
P3 (evidence/support 1, ~100w): First line of argument with concrete examples. Embed at least one nuanced qualifier the author uses.
P4 (evidence/support 2, ~100w): Second line of argument; introduce a genuine complexity or tension.
P5 (counterargument and rebuttal, ~90w): Author acknowledges the strongest opposing view, then refutes it — the refutation must have a specific logical structure.
P6 (conclusion, ~70w): Restate thesis with a subtle extension or implication not stated in P1.

Topics: philosophy, ethics, history, art criticism, literary theory, cultural studies, political economy, sociology of knowledge.
STRICTLY PROHIBITED: Any science, medicine, biology, chemistry, physics, clinical content. ZERO science whatsoever.`,
    questionInstructions: `CARS QUESTION REQUIREMENTS:
- ZERO outside knowledge required — all answers must be derivable from the passage alone.
- Q1 (two-step): Requires understanding author's IMPLICIT premise, then applying it to a new case.
- Q3 (EXCEPT/LEAST): Identify which option the author would LEAST agree with — all 4 must be things a naive reading could associate with the author.
- Q4 (mechanism): "The author mentions [specific passage element] primarily in order to..." — tests rhetorical function, not content.
- Q5 (inference): Must go ONE step beyond what's stated — not restating, not over-reaching.
- Distractors must use the author's actual vocabulary to be genuinely tempting.
- Never ask about facts the passage doesn't address.`
  },
  BB: {
    label: "Biological and Biochemical Foundations (B/B)",
    passageInstructions: `Write a rigorous biology or biochemistry research experiment passage (400–600 words, 5–6 paragraphs).
P1 (background, ~80w): Introduce the biological concept — name the pathway, protein family, or cellular process and its physiological significance.
P2 (prior work, ~80w): Prior research — cite specific molecular mechanisms or experimental findings that set the stage.
P3 (methods, ~100w): Experimental design — name specific gene knockouts, protein constructs, cell lines, assay types (e.g., Western blot, ELISA, qPCR), and conditions. Include a control condition.
P4 (results, ~100w): Specific findings — include quantitative changes (fold-changes, percentages, relative levels). Include at least one result that challenges the initial hypothesis.
P5 (analysis, ~90w): Mechanistic explanation — connect results to specific molecular interactions or pathway steps.
P6 (conclusion, ~60w): Broader biological implication or a testable follow-up prediction.

Topics: molecular biology, genetics, gene regulation, cell signaling, metabolism, enzyme kinetics, physiology, evolution, microbiology.
PROHIBITED: clinical drug treatment protocols, specific drug dosages.`,
    questionInstructions: `B/B QUESTION REQUIREMENTS:
- At least 2 questions must require knowing a pathway or mechanism NOT described in the passage.
- At least 1 question must reference a specific quantitative finding from paragraph 4.
- The EXCEPT question should include 3 options that follow logically from one pathway and 1 that applies to a different (easily confused) pathway.
- Hypothetical must involve a genetic or biochemical perturbation (knockout, overexpression, inhibitor).`
  },
  PS: {
    label: "Psychological, Social, and Biological Foundations of Behavior (P/S)",
    passageInstructions: `Write a rigorous psychology or sociology research study passage (400–600 words, 5–6 paragraphs).
P1 (background, ~80w): Introduce the psychological or sociological construct — name the theoretical framework and define the key variable.
P2 (prior work, ~80w): Prior research — cite named theories, researchers, or landmark studies that frame the current study.
P3 (methods, ~100w): Study design — specify participant selection, independent and dependent variables, control conditions, and measurement instruments (named scales or tasks).
P4 (results, ~100w): Findings with specific statistics or effect descriptions. Include a finding that is counterintuitive or that contradicts a prior study mentioned in P2.
P5 (analysis, ~90w): Theoretical interpretation — connect results to named psychological or sociological mechanisms.
P6 (conclusion, ~60w): Practical implication or limitation of the study design.

Topics: learning, memory, cognition, emotion, motivation, development, social behavior, identity, culture, institutions, research methods, statistics, behavioral neuroscience.`,
    questionInstructions: `P/S QUESTION REQUIREMENTS:
- At least 2 questions must require knowledge of a named theory or construct NOT mentioned in the passage.
- At least 1 question must reference the specific study design or methodology from paragraph 3.
- The EXCEPT question should test a distinction between two similar theoretical frameworks.
- Distractors must use real psychology/sociology terminology to be genuinely tempting.`
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { microSkillName, microSkillDescription, conceptSummary, originalMistake, section = "CP" } = req.body;
  if (!microSkillName) return res.status(400).json({ error: "Missing micro-skill name." });

  const ctx = SECTION_CONTEXT[section] || SECTION_CONTEXT["CP"];

  const systemPrompt = `You are a senior AAMC MCAT item writer for the ${ctx.label} section with 10+ years of experience. Your questions have appeared on real MCAT administrations. You write questions that distinguish 520+ scorers from 510 scorers. Respond with valid JSON only — no markdown, no extra text.

SECTION: ${ctx.label}

═══════════════════════════════════
STEP 1: WRITE THE PASSAGE (400–600 words)
═══════════════════════════════════
${ctx.passageInstructions}

PASSAGE QUALITY STANDARD:
- Every sentence must be load-bearing — no filler.
- Embed specific quantitative data that questions can reference.
- Include at least one result that is counterintuitive or that requires outside knowledge to explain.
- The passage must be self-consistent — no contradictions.

═══════════════════════════════════
STEP 2: WRITE 5 AAMC-QUALITY QUESTIONS
═══════════════════════════════════
${ctx.questionInstructions}

${AAMC_QUESTION_RULES}

═══════════════════════════════════
JSON OUTPUT FORMAT
═══════════════════════════════════
{
  "passageTitle": "Passage 1 (Questions 1–5)",
  "passage": "Full 400-600 word passage across 5-6 paragraphs...",
  "drills": [
    {
      "questionNumber": 1,
      "questionType": "TWO-STEP",
      "question": "Full question stem ending with a question mark",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correctAnswerIndex": 2,
      "explanation": "CORRECT (C): [cite passage detail + outside concept]. WRONG A [REVERSAL]: [misconception exploited]. WRONG B [PARTIAL]: [misconception exploited]. WRONG D [CONFLATION]: [misconception exploited]."
    },
    { "questionNumber": 2, "questionType": "HYPOTHETICAL", "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 0, "explanation": "..." },
    { "questionNumber": 3, "questionType": "EXCEPT", "question": "All of the following are consistent with the passage findings EXCEPT", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 1, "explanation": "..." },
    { "questionNumber": 4, "questionType": "MECHANISM", "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 3, "explanation": "..." },
    { "questionNumber": 5, "questionType": "INFERENCE", "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correctAnswerIndex": 1, "explanation": "..." }
  ]
}`;

  const userPrompt = `Write a ${ctx.label} passage and 5 AAMC-hard questions targeting this specific concept gap:

MICRO-SKILL: "${microSkillName}"
DESCRIPTION: ${microSkillDescription || ""}
${conceptSummary ? `\nCONCEPT THE STUDENT JUST LEARNED:\n${conceptSummary}` : ""}
${originalMistake ? `\nORIGINAL MISTAKE THE STUDENT MADE:\n${originalMistake}` : ""}

CRITICAL: The passage must be a NOVEL application of the concept — a completely different scenario than what the student saw before, so they must transfer understanding, not pattern-match. Design the wrong answers to specifically exploit the exact misconception described above.

Passage must be 400–600 words. Return valid JSON only.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 4096,
    });

    res.json(JSON.parse(completion.choices[0].message.content || "{}"));
  } catch (error: any) {
    console.error("drills error:", error);
    res.status(500).json({ error: error.message || "Drill generation failed." });
  }
}
