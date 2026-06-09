export type CardFormat = 'basic' | 'cloze' | 'occlusion' | 'sequence';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface PracticeQuestion {
  id: string;
  passage?: string;
  question: string;
  options: string[]; // typically 4 options: A, B, C, D
  correctAnswerIndex: number; // 0 to 3
  explanation: string;
  microSkill: string;
  userAnswerIndex?: number;
  isCorrect?: boolean;
}

export interface MicroSkill {
  id: string;
  name: string;
  description: string;
  broadTopic: string; // e.g. "Biochemistry - Acid/Base Chemistry"
  masteryStreak: number; // starts at 0, goes to 3 to complete mastery
  masteredAt?: number;
  unresolvedCount: number; // number of times flagged
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  stage: 'intake' | 'socratic' | 'mastery' | 'flashcard' | 'completed';
  microSkill?: MicroSkill;
  conceptSummary?: string; // plain language explanation
  messages: ChatMessage[];
  errorInputText?: string;
  errorInputImage?: string; // base64
  drills: PracticeQuestion[];
  drillStreak: number; // needs to reach 3
  drillHistory: { questionId: string; correct: boolean }[];
  userExplanationPrompt?: string; // Socratic verification prompt
}

export interface Flashcard {
  id: string;
  microSkillId: string;
  microSkillName: string;
  format: CardFormat;
  front: string; // contains the prompt, Cloze sentence with [...], occlusion description, or step 1
  back: string;  // contains the answer, revealed Cloze word, hidden image description, or full sequence
  userExplanationCheck: string; // user's own conceptual explanation validated by AI
  createdAt: number;
  
  // Spaced repetition fields (SM-2 Algorithm)
  repetitions: number;
  interval: number; // in days
  easeFactor: number;
  nextReviewDate: number; // timestamp
}

export interface QuizState {
  questions: PracticeQuestion[];
  currentIndex: number;
  answers: { [questionId: string]: number }; // questionId -> chosen index
  completed: boolean;
  score: number;
}
