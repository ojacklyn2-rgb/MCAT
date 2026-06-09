import React from 'react';
import { MicroSkill, Flashcard, ChatSession } from '../types';
import { BookOpen, CheckCircle, Flame, Calendar, Award, AlertTriangle, ChevronRight } from 'lucide-react';

interface AnalyticsDashboardProps {
  microSkills: MicroSkill[];
  flashcards: Flashcard[];
  sessions: ChatSession[];
  onNavigateToTab: (tab: string) => void;
  onNavigateToChat: (chatId: string) => void;
}

export function AnalyticsDashboard({
  microSkills,
  flashcards,
  sessions,
  onNavigateToTab,
  onNavigateToChat
}: AnalyticsDashboardProps) {
  // Compute analytics
  const masteredSkills = microSkills.filter(skill => skill.masteryStreak >= 3 || skill.masteredAt);
  const activeSkillsCount = microSkills.length - masteredSkills.length;
  
  const now = Date.now();
  const dueCardsCount = flashcards.filter(card => card.nextReviewDate <= now).length;
  const totalCardsCount = flashcards.length;

  // Active sessions in progress
  const activeSessions = sessions.filter(s => s.stage !== 'completed');

  // Find priority weaknesses (skills flagged multiple times or stage not finished)
  const priorityWeaknesses = [...microSkills]
    .sort((a, b) => b.unresolvedCount - a.unresolvedCount)
    .slice(0, 4);

  return (
    <div className="space-y-8 max-w-6xl mx-auto px-6 text-[#37352f]" id="analytics-root">
      {/* Welcome & Motivational Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[#e4e4e3] pb-4 animate-fade-in" id="analytics-header">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#37352f] font-sans flex items-center gap-2">
            Workspace Dashboard
          </h1>
          <p className="text-xs text-[#37352f]/60 font-sans mt-0.5">
            Identify, isolate, and eliminate your conceptual gaps. Active retrieval study board.
          </p>
        </div>
        <div className="flex gap-2 mt-4 md:mt-0" id="analytics-actions">
          <button
            onClick={() => onNavigateToTab('sessions')}
            className="px-3 py-1.5 text-xs bg-[#37352f] hover:bg-[#37352f]/90 text-white rounded transition-all font-sans cursor-pointer flex items-center gap-1.5 font-semibold"
            id="start-study-session-btn"
          >
            <BookOpen size={13} />
            New Socratic Session
          </button>
        </div>
      </div>

      {/* Metrics Row - Styled like a database gallery row in Notion */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="metrics-grid">
        <div className="bg-[#f7f7f5]/80 border border-[#e4e4e3] p-4 rounded-md flex items-center justify-between" id="metric-mastered">
          <div className="space-y-1">
            <span className="text-[10px] text-[#37352f]/50 font-sans font-bold uppercase tracking-wider block">Mastered Skills</span>
            <span className="text-2xl font-bold font-sans text-[#37352f] block">{masteredSkills.length}</span>
            <span className="text-[11px] text-[#2ebd6e] font-sans block flex items-center gap-1.5 font-medium">
              <CheckCircle size={10} /> Solid active recall
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-[#e4e4e3]">
            <Award className="text-[#37352f]/70" size={16} />
          </div>
        </div>

        <div className="bg-[#f7f7f5]/80 border border-[#e4e4e3] p-4 rounded-md flex items-center justify-between" id="metric-due">
          <div className="space-y-1">
            <span className="text-[10px] text-[#37352f]/50 font-sans font-bold uppercase tracking-wider block">SRS Queue Due</span>
            <span className="text-2xl font-bold font-sans text-[#37352f] block">{dueCardsCount} <span className="text-xs text-[#37352f]/50 font-sans">/ {totalCardsCount}</span></span>
            <span className="text-[11px] text-[#d97706] font-sans block flex items-center gap-1.5 font-medium">
              <Calendar size={10} /> Spaced reviews
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-[#e4e4e3]">
            <BookOpen className="text-[#37352f]/70" size={16} />
          </div>
        </div>

        <div className="bg-[#f7f7f5]/80 border border-[#e4e4e3] p-4 rounded-md flex items-center justify-between" id="metric-active">
          <div className="space-y-1">
            <span className="text-[10px] text-[#37352f]/50 font-sans font-bold uppercase tracking-wider block">Active Diagnostics</span>
            <span className="text-2xl font-bold font-sans text-[#37352f] block">{activeSessions.length}</span>
            <span className="text-[11px] text-[#2563eb] font-sans block flex items-center gap-1.5 font-medium">
              <AlertTriangle size={10} /> Live coaching focus
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-[#e4e4e3]">
            <AlertTriangle className="text-[#37352f]/70" size={16} />
          </div>
        </div>

        <div className="bg-[#f7f7f5]/80 border border-[#e4e4e3] p-4 rounded-md flex items-center justify-between" id="metric-streak">
          <div className="space-y-1">
            <span className="text-[10px] text-[#37352f]/50 font-sans font-bold uppercase tracking-wider block">Mastery Run Streak</span>
            <span className="text-2xl font-bold font-sans text-[#37352f] block">3/3</span>
            <span className="text-[11px] text-[#4f46e5] font-sans block flex items-center gap-1.5 font-medium">
              <Flame size={10} /> Drill streak threshold
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-[#e4e4e3]">
            <Flame className="text-[#37352f]/70" size={16} />
          </div>
        </div>
      </div>

      {/* Two-Column Section: Priority Weaknesses vs Mastery Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="dashboard-columns">
        
        {/* Identified Weakness Grid */}
        <div className="space-y-3" id="priority-weaknesses">
          <div className="flex justify-between items-center pb-2 border-b border-[#e4e4e3]" id="weakness-header">
            <h3 className="font-bold text-[#37352f] font-sans text-xs flex items-center gap-2 uppercase tracking-wider">
              <AlertTriangle size={14} className="text-amber-500 shrink-0" />
              Target Weaknesses (High Risk)
            </h3>
            <span className="text-[10px] text-[#37352f]/40 font-mono tracking-wider font-semibold">Flagged Gaps</span>
          </div>

          {priorityWeaknesses.length === 0 ? (
            <div className="bg-[#f7f7f5] border border-[#e4e4e3] rounded p-6 text-center text-[#37352f]/50 font-sans text-xs" id="no-weakness-prompt">
              No micro-skills logged yet. Start by logging an incorrect answer in the side workspace.
            </div>
          ) : (
            <div className="space-y-2.5" id="weakness-list">
              {priorityWeaknesses.map((skill) => {
                const associatedChat = sessions.find(s => s.microSkill?.id === skill.id && s.stage !== 'completed');
                
                return (
                  <div
                    key={skill.id}
                    className="p-3.5 bg-white border border-[#e4e4e3] rounded-md hover:bg-[#f7f7f5]/40 transition-colors space-y-2"
                    id={`weakness-item-${skill.id}`}
                  >
                    <div className="flex justify-between gap-2 items-start" id={`weakness-item-header-${skill.id}`}>
                      <div>
                        <span className="text-[10px] text-[#37352f]/55 font-sans font-semibold block">{skill.broadTopic}</span>
                        <h4 className="font-bold text-[#37352f] font-sans text-xs sm:text-sm leading-tight">{skill.name}</h4>
                      </div>
                      <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-250 text-amber-800 text-[9px] font-bold rounded shrink-0">
                        {skill.masteryStreak === 3 ? 'Mastered' : `Streak: ${skill.masteryStreak}/3`}
                      </span>
                    </div>
                    <p className="text-xs text-[#37352f]/60 font-sans leading-relaxed">
                      {skill.description}
                    </p>
                    {associatedChat && (
                      <button
                        onClick={() => onNavigateToChat(associatedChat.id)}
                        className="text-[11px] text-[#37352f] font-semibold hover:underline flex items-center gap-1 pt-1 cursor-pointer transition-all"
                        id={`resume-chat-btn-${skill.id}`}
                      >
                        Resume coaching session <ChevronRight size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mastered Concepts Feed */}
        <div className="space-y-3" id="mastery-log">
          <div className="flex justify-between items-center pb-2 border-b border-[#e4e4e3]" id="mastery-header">
            <h3 className="font-bold text-[#37352f] font-sans text-xs flex items-center gap-2 uppercase tracking-wider">
              <Award size={14} className="text-emerald-600 shrink-0" />
              Mastered Concepts Log
            </h3>
            <span className="text-[10px] text-[#37352f]/40 font-mono tracking-wider font-semibold">Verified (Streak-3)</span>
          </div>

          {masteredSkills.length === 0 ? (
            <div className="bg-[#f7f7f5] border border-[#e4e4e3] rounded p-6 text-center text-[#37352f]/50 font-sans text-xs" id="no-mastery-prompt">
              Achieve a consecutive streak of 3 correct answers in mastery drills to lock in a concept.
            </div>
          ) : (
            <div className="space-y-2.5" id="mastery-list">
              {masteredSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="p-3.5 bg-[#fbfbfa] border border-[#e4e4e3] rounded-md flex items-start gap-3"
                  id={`mastery-item-${skill.id}`}
                >
                  <div className="h-4 w-4 rounded-sm bg-emerald-50 border border-emerald-300 flex items-center justify-center text-emerald-800 text-[10px] font-bold shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#37352f]/55 font-sans font-semibold block">{skill.broadTopic}</span>
                    <h4 className="font-bold text-[#37352f]/90 font-sans text-xs sm:text-sm leading-tight">{skill.name}</h4>
                    <p className="text-xs text-[#37352f]/65 font-sans leading-relaxed">{skill.description}</p>
                    {skill.masteredAt && (
                      <span className="text-[9px] text-[#37352f]/40 block">
                        Locked: {new Date(skill.masteredAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Philosophy Callout Card */}
      <div className="border border-[#e4e4e3] bg-[#f7f7f5]/40 p-5 rounded-md space-y-2 text-left" id="philosophy-box">
        <h4 className="font-bold text-[#37352f]/80 font-sans text-xs tracking-wider uppercase">philosophy: Practice-first, Active recall only</h4>
        <p className="text-xs text-[#37352f]/70 font-sans leading-relaxed">
          The 520+ tier belongs to pre-meds who aggressively hunt down and resolve every tiny conceptual error. Passive content consumption (reading textbooks or watching videos) is a slow cognitive illusion. 
          Every session here forces a Socratic dialogue, validates your custom typed explanation, and checks active mastery under a strict 3-in-a-row correct drill requirement. Earn your understanding, spacing reviews, and mixing topics deliberately.
        </p>
      </div>
    </div>
  );
}
