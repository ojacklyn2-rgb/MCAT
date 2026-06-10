import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── SHARED AAMC DISTRACTOR ENGINEERING RULES ─────────────────────────────────
const AAMC_RULES = `
═══════════════════════════════════════════
AAMC QUESTION ENGINEERING — MANDATORY
═══════════════════════════════════════════

RULE 1 — NO BASIC RECALL. Never ask "What is X?", "Which defines X?", or any question answerable
from a textbook definition alone.

RULE 2 — PASSAGE + OUTSIDE KNOWLEDGE FUSION. At least 3 of 4 questions must be unsolvable without
combining a specific passage detail with outside MCAT content knowledge.

RULE 3 — QUESTION TYPE DISTRIBUTION across the 4 questions:
  Q1: TWO-STEP REASONING — Derive intermediate conclusion from passage → apply outside concept.
  Q2: HYPOTHETICAL/PERTURBATION — "If [specific passage variable] changed, what would happen?"
  Q3: EXCEPT/LEAST — "All of the following are consistent EXCEPT..." evaluating all 4 options.
  Q4: MECHANISM or INFERENCE — "Which best explains WHY..." or "The findings most strongly support..."

RULE 4 — DISTRACTOR ENGINEERING. Each wrong answer must exploit a named misconception:
  [REVERSAL]      — Student swaps direction of change or cause/effect.
  [PARTIAL]       — Knows step 1 of mechanism but not step 2.
  [SCOPE ERROR]   — Correct concept, wrong variable or context.
  [CONFLATION]    — Confuses two similar concepts (e.g., Km vs Vmax, oxidation vs reduction).
  [ATTRACTIVE]    — Correct MCAT vocabulary but wrong mechanism — the most dangerous distractor.
  [OVERGENERALIZE]— True in general but not under the specific passage conditions.

Wrong answers must NOT be obviously wrong. A well-prepared student with one subtle misconception
must find each wrong answer genuinely tempting.

RULE 5 — ANSWER CHOICE CRAFT.
- All 4 options grammatically parallel.
- Rotate correctAnswerIndex across questions — never the same index twice in a row.
- No "All of the above" or "None of the above."
- Correct answer unambiguously correct under MCAT standards.

RULE 6 — EXPLANATION FORMAT (required):
"CORRECT (index X): [Why correct — cite specific passage detail + outside concept].
WRONG [letter] [distractor type]: [Exact misconception and why wrong].
WRONG [letter] [distractor type]: [Exact misconception and why wrong].
WRONG [letter] [distractor type]: [Exact misconception and why wrong]."

RULE 7 — TEXT ONLY. No references to figures, tables, graphs, or images.
`;

const SECTION_CTX: Record<string, { label: string; passageInstructions: string; questionInstructions: string }> = {
  CP: {
    label: "Chemical and Physical Foundations (C/P)",
    passageInstructions: `Write a rigorous chemistry or physics research experiment passage (400–550 words, 5 paragraphs).
P1 (~80w): Introduce the concept — name equations, constants, or theoretical principles at play.
P2 (~80w): Prior research or theoretical framework with specific named references.
P3 (~100w): Precise experimental setup — named reagents with concentrations, specific temperatures, instrument names, control conditions.
P4 (~100w): Quantitative findings — specific numbers/ratios that questions will reference. Include one counterintuitive result.
P5 (~90w): Mechanistic interpretation at the molecular/atomic level + one unanswered implication.
Topics: general chemistry, organic chemistry, biochemistry, thermodynamics, electrochemistry, acid-base, kinetics, optics, fluid dynamics.
PROHIBITED: clinical patient cases, diagnosis, treatment.`,
    questionInstructions: `C/P: At least 2 questions require mathematical reasoning using passage numbers. Hypothetical must change a specific passage numerical value. EXCEPT question must include 3 options from the same conceptual framework and 1 from a commonly confused alternate framework.`
  },
  CARS: {
    label: "Critical Analysis and Reasoning Skills (CARS)",
    passageInstructions: `Write a sophisticated CARS humanities or social science essay (450–550 words, 5–6 paragraphs).
P1 (~80w): Specific, debatable central thesis — not an observation, an argument.
P2 (~90w): Intellectual context — name thinkers, movements, or historical events the author responds to.
P3 (~100w): First line of argument with concrete examples and at least one nuanced qualifier.
P4 (~100w): Second argument; introduce genuine tension or complexity in the author's position.
P5 (~90w): Strongest opposing view acknowledged and refuted with specific logical structure.
P6 (~60w): Conclusion extending the thesis to a subtle implication not in P1.
Topics: philosophy, ethics, history, art criticism, literary theory, cultural studies, political economy.
STRICTLY PROHIBITED: Any science, medicine, biology, chemistry, physics. ZERO science.`,
    questionInstructions: `CARS: Zero outside knowledge needed — all answers from passage alone. Distractors must use the author's own vocabulary. Q3 EXCEPT: all 4 options must be things a careless reader could associate with the author. Q4 mechanism: test why the author includes a specific passage element (rhetorical function). Never ask about facts the passage doesn't address.`
  },
  BB: {
    label: "Biological and Biochemical Foundations (B/B)",
    passageInstructions: `Write a rigorous biology or biochemistry research passage (400–550 words, 5 paragraphs).
P1 (~80w): Name the pathway, protein family, or cellular process and its physiological significance.
P2 (~80w): Prior research — specific molecular mechanisms, named proteins, prior experimental findings.
P3 (~100w): Methods — name gene knockouts, protein constructs, cell lines, assay types (Western blot, ELISA, qPCR), control conditions.
P4 (~100w): Results — quantitative fold-changes or percentages. Include one result that challenges the initial hypothesis.
P5 (~90w): Mechanistic explanation connecting results to specific pathway steps + follow-up prediction.
Topics: molecular biology, genetics, gene regulation, cell signaling, metabolism, enzyme kinetics, physiology, evolution.
PROHIBITED: clinical drug treatment protocols.`,
    questionInstructions: `B/B: At least 2 questions require knowing a pathway/mechanism not in the passage. EXCEPT question: 3 options from one pathway, 1 from a commonly confused adjacent pathway. Hypothetical must involve a genetic or biochemical perturbation (knockout, overexpression, inhibitor).`
  },
  PS: {
    label: "Psychological, Social, and Biological Foundations of Behavior (P/S)",
    passageInstructions: `Write a rigorous psychology or sociology research study passage (400–550 words, 5 paragraphs).
P1 (~80w): Name the theoretical framework, define the key construct, state the research question.
P2 (~80w): Prior research — cite named theories, researchers, or landmark studies.
P3 (~100w): Methods — participant selection, independent/dependent variables, control conditions, named measurement instruments.
P4 (~100w): Findings with specific statistics or effect descriptions. Include one counterintuitive finding that contradicts P2.
P5 (~90w): Theoretical interpretation using named psychological/sociological mechanisms + study limitation.
Topics: learning, memory, cognition, emotion, motivation, development, social behavior, identity, culture, institutions, research methods, behavioral neuroscience.`,
    questionInstructions: `P/S: At least 2 questions require knowledge of a named theory not in the passage. EXCEPT question: test distinction between two similar frameworks (e.g., classical vs operant, prejudice vs discrimination). Distractors must use real psychology/sociology terminology.`
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { skillSets } = req.body;
  if (!skillSets || !Array.isArray(skillSets) || skillSets.length === 0)
    return res.status(400).json({ error: "Provide at least one skill set." });

  const setsToGenerate = skillSets.slice(0, 3);

  const results = await Promise.all(setsToGenerate.map(async (
    skill: { name: string; description: string; section: string }, i: number
  ) => {
    const section = skill.section || "CP";
    const ctx = SECTION_CTX[section] || SECTION_CTX["CP"];

    const systemPrompt = `You are a senior AAMC MCAT item writer for the ${ctx.label} section. You write questions that distinguish 520+ scorers from 510 scorers. Respond with valid JSON only — no markdown.

PASSAGE INSTRUCTIONS:
${ctx.passageInstructions}

${AAMC_RULES}

SECTION-SPECIFIC QUESTION REQUIREMENTS:
${ctx.questionInstructions}

JSON FORMAT:
{
  "passageTitle": "Passage ${i + 1} (Questions ${i * 4 + 1}–${i * 4 + 4})",
  "passage": "Full 400-550 word passage...",
  "skillName": "${skill.name}",
  "section": "${section}",
  "questions": [
    {
      "questionType": "TWO-STEP",
      "question": "Full question stem?",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correctAnswerIndex": 2,
      "explanation": "CORRECT (C): [passage detail + outside concept]. WRONG A [REVERSAL]: [...]. WRONG B [PARTIAL]: [...]. WRONG D [CONFLATION]: [...]."
    },
    { "questionType": "HYPOTHETICAL", "question": "...", "options": ["A. ...","B. ...","C. ...","D. ..."], "correctAnswerIndex": 0, "explanation": "..." },
    { "questionType": "EXCEPT", "question": "All of the following are consistent with the passage findings EXCEPT", "options": ["A. ...","B. ...","C. ...","D. ..."], "correctAnswerIndex": 3, "explanation": "..." },
    { "questionType": "MECHANISM", "question": "...", "options": ["A. ...","B. ...","C. ...","D. ..."], "correctAnswerIndex": 1, "explanation": "..." }
  ]
}`;

    const userPrompt = `Write a ${ctx.label} passage and 4 AAMC-hard questions targeting this concept:

MICRO-SKILL: "${skill.name}"
DESCRIPTION: ${skill.description || ""}

CRITICAL: The passage must be a NOVEL scenario the student hasn't seen — they must transfer understanding, not pattern-match. Design each wrong answer to specifically exploit the misconception described above. Make the distractors as tempting as real AAMC wrong answers.

Return valid JSON only.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 3500,
    });

    return JSON.parse(completion.choices[0].message.content || "{}");
  }));

  res.json({ passageSets: results });
}
