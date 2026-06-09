import React, { useState } from 'react';
import { Flashcard, PracticeQuestion } from '../types';
import { Calendar, HelpCircle, Layers, ArrowRight, RefreshCw, CheckSquare, XCircle, FileText, CheckCircle2 } from 'lucide-react';

interface SpacedRepetitionDeckProps {
  cards: Flashcard[];
  onUpdateCard: (updated: Flashcard) => void;
  onDeleteCard: (cardId: string) => void;
}

export function SpacedRepetitionDeck({
  cards,
  onUpdateCard,
  onDeleteCard
}: SpacedRepetitionDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [typedRecallResponse, setTypedRecallResponse] = useState('');
  
  // Active review practice questions
  const [activeReviewQuestion, setActiveReviewQuestion] = useState<PracticeQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasCheckedAnswer, setHasCheckedAnswer] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);

  // Filter cards due today or earlier
  const now = Date.now();
  const dueCards = cards.filter(card => card.nextReviewDate <= now);
  const upcomingCards = cards.filter(card => card.nextReviewDate > now);

  const activeCard = dueCards[currentIndex];

  // Fetch a fresh active recall question for this concept
  const fetchActiveRecallQuestion = async (microSkillName: string) => {
    setIsLoadingQuestion(true);
    setActiveReviewQuestion(null);
    setSelectedOption(null);
    setHasCheckedAnswer(false);

    try {
      const response = await fetch('/api/card/generate-review-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          microSkillName: microSkillName,
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate verification question.');
      }

      const question = await response.json();
      setActiveReviewQuestion(question);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const handleRevealCard = () => {
    setIsFlipped(true);
    if (activeCard) {
      fetchActiveRecallQuestion(activeCard.microSkillName);
    }
  };

  // SM-2 Rating Handler
  const handleRateCard = (quality: number) => {
    if (!activeCard) return;

    // SM-2 algorithm variables
    let tempRepetitions = activeCard.repetitions;
    let tempEaseFactor = activeCard.easeFactor;
    let tempInterval = activeCard.interval;

    if (quality >= 3) {
      if (tempRepetitions === 0) {
        tempInterval = 1;
      } else if (tempRepetitions === 1) {
        tempInterval = 6;
      } else {
        tempInterval = Math.round(tempInterval * tempEaseFactor);
      }
      tempRepetitions += 1;
    } else {
      tempRepetitions = 0;
      tempInterval = 1;
    }

    // Update Ease Factor
    tempEaseFactor = tempEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (tempEaseFactor < 1.3) tempEaseFactor = 1.3;

    // Calculate next review timestamp (interval in days)
    const nextReviewDate = Date.now() + tempInterval * 24 * 60 * 60 * 1000;

    onUpdateCard({
      ...activeCard,
      repetitions: tempRepetitions,
      interval: tempInterval,
      easeFactor: tempEaseFactor,
      nextReviewDate
    });

    // Move next or reset
    setIsFlipped(false);
    setTypedRecallResponse('');
    setActiveReviewQuestion(null);
    setSelectedOption(null);
    setHasCheckedAnswer(false);

    // If we've reviewed the last item, reset index
    if (currentIndex >= dueCards.length - 1) {
      setCurrentIndex(0);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-6 text-[#37352f]" id="srs-deck-container">
      
      {/* Deck Header */}
      <div className="border-b border-[#e4e4e3] pb-4" id="srs-header">
        <h1 className="text-xl font-bold tracking-tight text-[#37352f] font-sans flex items-center gap-2">
          <Layers size={18} className="text-[#37352f]/70" />
          SRS Spaced Recall Queue
        </h1>
        <p className="text-xs text-[#37352f]/60 font-sans mt-0.5">
          Dual-locked recall checks. Each reviews pairs the prompt with an active Socratic multiple-choice verification.
        </p>
      </div>

      {/* Due queue counters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="srs-counters">
        <div className="p-4 bg-[#f7f7f5] border border-[#e4e4e3] rounded-md flex justify-between items-center shadow-[0_1px_2px_rgba(15,15,15,0.03)] text-[#37352f]">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#37352f]/50 block">Due for review</span>
            <span className="text-2xl font-bold block mt-0.5">{dueCards.length}</span>
          </div>
          <Calendar size={18} className="text-[#37352f]/40" />
        </div>
        
        <div className="p-4 bg-white border border-[#e4e4e3] rounded-md flex justify-between items-center shadow-[0_1px_2px_rgba(15,15,15,0.03)] text-[#37352f]">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#37352f]/50 block">Total cards deck</span>
            <span className="text-2xl font-bold block mt-0.5">{cards.length}</span>
          </div>
          <Layers size={18} className="text-[#37352f]/40" />
        </div>

        <div className="p-4 bg-[#f7f7f5]/40 border border-[#e4e4e3] rounded-md flex justify-between items-center text-[#37352f]/60 text-xs font-sans">
          <div className="space-y-1">
            <span className="font-bold block uppercase text-[9px] text-[#37352f]/40">Algorithm Spec</span>
            <p className="leading-relaxed text-[#37352f]/70 text-[11px]">
              SM-2 formula calculates exact calendar days depending on retrieval confidence levels.
            </p>
          </div>
        </div>
      </div>

      {dueCards.length === 0 ? (
        <div className="bg-[#f7f7f5]/50 border border-[#e4e4e3] rounded-md p-10 text-center text-[#37352f]/50 font-sans space-y-3 antialiased" id="srs-empty-box">
          <CheckSquare size={24} className="text-[#2ebd6e] mx-auto" />
          <div className="space-y-0.5">
            <h3 className="font-bold text-[#37352f] text-sm">Your Spaced Recall Queue is Completely Clean!</h3>
            <p className="text-xs text-[#37352f]/60">No cards pending review today. Let things settle or generate custom study trials.</p>
          </div>

          {upcomingCards.length > 0 && (
            <div className="max-w-md mx-auto pt-4 border-t border-[#e4e4e3] text-left text-xs space-y-1.5 text-[#37352f]/70" id="srs-upcoming-list">
              <span className="font-bold uppercase text-[#37352f]/40 tracking-wider text-[9px] block">Upcoming intervals:</span>
              <div className="space-y-1.5">
                {upcomingCards.slice(0, 3).map((uc) => (
                  <div key={uc.id} className="flex justify-between items-center bg-white p-2 border border-[#e4e4e3] rounded" id={`upcoming-${uc.id}`}>
                    <span className="font-semibold text-[#37352f]/80 truncate max-w-[70%]">{uc.microSkillName}</span>
                    <span className="text-[10px] text-[#37352f]/50">
                      Due: {new Date(uc.nextReviewDate).toLocaleDateString()} ({uc.interval}d)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5" id="srs-review-workspace">
          
          {/* Main Flashcard display */}
          <div className="bg-white border border-[#e4e4e3] rounded-md shadow-[0_1px_3px_rgba(15,15,15,0.05)] overflow-hidden" id="card-panel">
            
            {/* Card header */}
            <div className="bg-[#f7f7f5] border-b border-[#e4e4e3] p-3 flex justify-between items-center text-xs" id="card-header">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-[#efeee3] text-[#37352f]/80 text-[9px] font-bold rounded uppercase tracking-wider font-sans border border-[#e4e4e3]">
                  {activeCard.format}
                </span>
                <span className="font-semibold text-[#37352f]/70">{activeCard.microSkillName}</span>
              </div>
              <span className="text-[#37352f]/50">
                Card {currentIndex + 1} of {dueCards.length}
              </span>
            </div>

            {/* Flip card contents */}
            <div className="p-6 space-y-5 text-center" id="card-body">
              
              {/* Question / Front Prompt */}
              <div className="space-y-2" id="card-prompt-container">
                <span className="text-[9px] text-[#37352f]/40 uppercase tracking-wider font-bold block">RECALL PROMPT</span>
                <p className="text-sm sm:text-base font-bold text-[#37352f] leading-normal max-w-2xl mx-auto whitespace-pre-wrap">
                  {activeCard.front}
                </p>
              </div>

              {/* Student active written workspace */}
              {!isFlipped && (
                <div className="max-w-xl mx-auto space-y-2 pt-3 bg-[#f8f8f6] p-3.5 border border-[#e4e4e3] rounded-md text-left" id="srs-active-written">
                  <label htmlFor="student-written-recall" className="text-xs font-bold text-[#37352f]/80 font-sans block">Type Your Conceptual Recall (Highly Recommended)</label>
                  <textarea
                    id="student-written-recall"
                    value={typedRecallResponse}
                    onChange={(e) => setTypedRecallResponse(e.target.value)}
                    placeholder="Type what you remember about the molecular process, step-by-step parameters, or formula before highlighting..."
                    className="w-full h-16 p-2 border border-[#e4e4e3] rounded font-sans text-xs bg-white focus:outline-none"
                  />
                  <span className="text-[9px] text-[#37352f]/40 block font-sans">Forced active output beats simple retrieval sensation. Make yourself type down variables first!</span>
                </div>
              )}

              {/* Back Answer (Revealed) */}
              {isFlipped && (
                <div className="border-t border-[#e4e4e3] pt-5 space-y-3 animate-fade-in" id="card-answer-container">
                  <span className="text-[9px] text-[#2ebd6e] uppercase tracking-wider font-bold block flex items-center justify-center gap-1">
                    ✓ CORRECT CONSTITUENTS
                  </span>
                  <p className="text-sm font-semibold text-[#37352f] leading-normal max-w-2xl mx-auto whitespace-pre-wrap">
                    {activeCard.back}
                  </p>

                  {/* Highlight original verified summary check */}
                  {activeCard.userExplanationCheck && (
                    <div className="max-w-xl mx-auto p-3 bg-[#f7f7f5]/80 border border-[#e4e4e3] rounded-md text-left text-xs text-[#37352f]/70 space-y-1" id="original-summary">
                      <span className="font-bold text-[#37352f]/40 block uppercase tracking-wider text-[8px] font-sans">Your original verified explanation:</span>
                      <p className="italic font-sans leading-normal">"{activeCard.userExplanationCheck}"</p>
                    </div>
                  )}
                </div>
              )}

              {/* Flip action buttons */}
              {!isFlipped ? (
                <button
                  onClick={handleRevealCard}
                  className="px-6 py-2 bg-[#37352f] hover:bg-[#2c2b27] text-white rounded font-sans font-semibold text-xs transition cursor-pointer"
                  id="flip-card-btn"
                >
                  Flip & Answer recall check
                </button>
              ) : (
                <div className="space-y-4 max-w-3xl border-t border-[#e4e4e3] pt-5 mx-auto" id="double-check-feedback">
                  
                  {/* SECOND GATED STEP: AI ACTIVE TRIAL MCQ */}
                  <div className="bg-[#f7f7f5] border border-[#e4e4e3] p-4 rounded-md text-left space-y-3" id="srs-ai-gate-question">
                    <div>
                      <span className="px-1.5 py-0.5 bg-[#37352f] text-white text-[9px] font-bold rounded uppercase tracking-wider font-sans">active recall check-question</span>
                      <h4 className="font-bold text-[#37352f] font-sans text-xs mt-1.5 leading-normal">Validate retaining context under a fresh MCAT-designed drill</h4>
                    </div>

                    {isLoadingQuestion ? (
                      <div className="flex items-center gap-2 py-4 justify-center" id="srs-loading-active-mcq">
                        <RefreshCw className="animate-spin text-[#37352f]/60 h-4 w-4" />
                        <span className="text-[#37352f]/50 font-sans text-xs">Tutor is drafting active verification MCQ...</span>
                      </div>
                    ) : activeReviewQuestion ? (
                      <div className="space-y-3.5" id="srs-active-question-details">
                        
                        {/* Passage (if any) */}
                        {activeReviewQuestion.passage && (
                          <div className="p-3 bg-white border border-[#e4e4e3] rounded text-xs leading-relaxed font-sans text-[#37352f]/80 max-h-36 overflow-y-auto" id="srs-active-passage">
                            {activeReviewQuestion.passage}
                          </div>
                        )}

                        <p className="font-bold text-[#37352f] font-sans text-xs leading-relaxed">Q: {activeReviewQuestion.question}</p>

                        {/* MCQ options selection */}
                        <div className="grid grid-cols-1 gap-1.5" id="srs-active-options-list">
                          {activeReviewQuestion.options.map((option, idx) => {
                            const letters = ['A', 'B', 'C', 'D'];
                            const isSelected = selectedOption === idx;
                            const isCorrectAnswer = idx === activeReviewQuestion.correctAnswerIndex;

                            let optClass = "border-[#e4e4e3] bg-white hover:bg-[#f7f7f5]/45";
                            let badgeClass = "bg-[#f1f1ef] text-[#37352f]";

                            if (isSelected) {
                              optClass = "border-[#37352f] bg-[#efeee3] font-semibold";
                              badgeClass = "bg-[#37352f] text-white";
                            }

                            if (hasCheckedAnswer) {
                              if (isCorrectAnswer) {
                                optClass = "border-[#2ebd6e] bg-[#f0f9f4] text-[#1b5d38] font-bold";
                                badgeClass = "bg-[#2ebd6e] text-white";
                              } else if (isSelected) {
                                optClass = "border-red-400 bg-red-50 text-red-950";
                                badgeClass = "bg-red-500 text-white";
                              } else {
                                optClass = "border-[#e4e4e3] bg-white opacity-40";
                              }
                            }

                            return (
                              <button
                                key={idx}
                                disabled={hasCheckedAnswer}
                                onClick={() => setSelectedOption(idx)}
                                type="button"
                                className={`text-left p-2.5 border rounded text-xs flex items-start gap-2 cursor-pointer transition-all ${optClass}`}
                              >
                                <span className={`h-5 w-5 rounded-sm flex items-center justify-center font-bold text-[10px] shrink-0 ${badgeClass}`}>
                                  {letters[idx]}
                                </span>
                                <span className="mt-0.5 leading-snug">{option}</span>
                              </button>
                            );
                          })}
                        </div>

                        {!hasCheckedAnswer ? (
                          <button
                            type="button"
                            disabled={selectedOption === null}
                            onClick={() => setHasCheckedAnswer(true)}
                            className="px-4 py-1.5 bg-[#37352f] text-white font-sans font-semibold rounded text-xs hover:bg-[#2c2b27] disabled:opacity-40 transition-colors cursor-pointer"
                            id="srs-check-mcq-btn"
                          >
                            Verify MCQ Choice
                          </button>
                        ) : (
                          <div className={`p-3.5 rounded border text-xs font-sans space-y-1 ${
                            selectedOption === activeReviewQuestion.correctAnswerIndex
                              ? 'bg-[#f0f9f4] border-[#2ebd6e]/20 text-[#195c36]'
                              : 'bg-[#fdf3f3] border-red-200/30 text-[#6a1d1d]'
                          }`} id="srs-check-explanation">
                            <span className="font-bold flex items-center gap-1 text-[9px] uppercase tracking-wider">
                              {selectedOption === activeReviewQuestion.correctAnswerIndex ? (
                                <span className="text-[#195c36] flex items-center gap-1"><CheckCircle2 size={12} /> CORRECT PASSAGE RECONCILIATION</span>
                              ) : (
                                <span className="text-[#6a1d1d] flex items-center gap-1"><XCircle size={12} /> RE-ENGAGE REASONING ERROR</span>
                              )}
                            </span>
                            <p className="leading-relaxed opacity-95 text-xs whitespace-pre-line text-[#37352f]/90">{activeReviewQuestion.explanation}</p>
                          </div>
                        )}

                      </div>
                    ) : (
                      <div className="text-[#37352f]/50 font-sans text-xs">Error drafting verification MCQ. Proceed to spacing assessment.</div>
                    )}
                  </div>

                  {/* Confirmatory Spaced Repetition Ratings panel */}
                  <div className="space-y-3 border-t border-[#e4e4e3] pt-5" id="srs-grading-block">
                    <span className="text-[9px] text-[#37352f]/45 uppercase tracking-wider font-bold block text-center">Rate recall performance (SM-2 Spacing Update)</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" id="rating-buttons-grid">
                      <button
                        onClick={() => handleRateCard(1)}
                        className="p-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-800 rounded font-sans text-xs font-medium cursor-pointer flex flex-col items-center gap-0.5 transition-colors"
                        id="forgot-rating-btn"
                      >
                        <span className="font-bold">Forgot/Incorrect</span>
                        <span className="text-[9px] opacity-85">Reset interval to 1d</span>
                      </button>
                      <button
                        onClick={() => handleRateCard(3)}
                        className="p-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded font-sans text-xs font-medium cursor-pointer flex flex-col items-center gap-0.5 transition-colors"
                        id="hestitate-rating-btn"
                      >
                        <span className="font-bold">Hesitating/Struggled</span>
                        <span className="text-[9px] opacity-85">Review soon (1-2d)</span>
                      </button>
                      <button
                        onClick={() => handleRateCard(5)}
                        className="p-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded font-sans text-xs font-medium cursor-pointer flex flex-col items-center gap-0.5 transition-colors"
                        id="perfect-rating-btn"
                      >
                        <span className="font-bold">Instant/Perfect</span>
                        <span className="text-[9px] opacity-85">Multiply spacing interval</span>
                      </button>
                    </div>
                  </div>

                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
