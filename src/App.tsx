import React, { useState, useEffect } from 'react';
import { ChatSession, Flashcard, MicroSkill } from './types';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { ActiveChatSession } from './components/ActiveChatSession';
import { SpacedRepetitionDeck } from './components/SpacedRepetitionDeck';
import { InterleavingQuizRunner } from './components/InterleavingQuizRunner';
import { BookOpen, Layers, Sparkles, MessageSquare, Plus, PenTool, Trash2, Award, LogOut, LayoutDashboard } from 'lucide-react';

// Seeding standard initial data if local storage is clean
const SEED_MICRO_SKILLS: MicroSkill[] = [
  {
    id: 'seed_HH',
    name: 'Logarithmic estimation of pH in buffers using Henderson-Hasselbalch under speed pressure',
    description: 'Confusion when approximation log values without a calculator (e.g., log of 0.05 or estimating ratio outputs above 1).',
    broadTopic: 'Chemistry/Physics - Solutions',
    masteryStreak: 1,
    unresolvedCount: 2
  },
  {
    id: 'seed_Galvanic',
    name: 'Distinguishing galvanic vs electrolytic salt bridge charge direction and anode terminals',
    description: 'Misunderstanding charge flow and why anodes are negative in galvanic systems but positive in electrolytic cells.',
    broadTopic: 'Chemistry/Physics - Electrochemistry',
    masteryStreak: 3,
    masteredAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    unresolvedCount: 1
  },
  {
    id: 'seed_Enzymes',
    name: 'Interpreting Competitive vs Mixed Enzyme Inhibition plot intersections (Vmax and Km)',
    description: 'Translating Lineweaver-Burk intersections when alpha and alpha-prime parameters differ.',
    broadTopic: 'Biology/Biochemistry - Enzyme Kinetics',
    masteryStreak: 2,
    unresolvedCount: 1
  }
];

const SEED_FLASHCARDS: Flashcard[] = [
  {
    id: 'seed_fc_1',
    microSkillId: 'seed_Galvanic',
    microSkillName: 'Distinguishing galvanic vs electrolytic salt bridge charge direction and anode terminals',
    format: 'basic',
    front: 'Does the anode carry a negative or positive charge in an electrolytic cell compared to a galvanic cell, and why?',
    back: 'Galvanic Cell: Anode is negative because oxidation occurs spontaneously releasing electrons. Electrolytic Cell: Anode is positive because an external voltage source withdraws electrons, forcing oxidation at the anode.',
    userExplanationCheck: 'Anodes are always sites of oxidation. Spontaneous galvanic releases electrons (negative anode); nonspontaneous electrolytic pulls them away (positive anode).',
    createdAt: Date.now() - 24 * 60 * 60 * 1000 * 2,
    repetitions: 1,
    interval: 1,
    easeFactor: 2.5,
    nextReviewDate: Date.now() - 1000 // due now
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [microSkills, setMicroSkills] = useState<MicroSkill[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');

  // 1. Initial State Load from Local Storage
  useEffect(() => {
    try {
      const storedSessions = localStorage.getItem('mcat_mastery_sessions');
      const storedFlashcards = localStorage.getItem('mcat_mastery_flashcards');
      const storedSkills = localStorage.getItem('mcat_mastery_skills');

      const now = Date.now();
      const SECTION_DEFAULTS: { id: string; section: MCATSection; title: string }[] = [
        { id: 'pinned_CP',   section: 'CP',   title: 'Chem / Phys (C/P)' },
        { id: 'pinned_CARS', section: 'CARS', title: 'CARS' },
        { id: 'pinned_BB',   section: 'BB',   title: 'Bio / Biochem (B/B)' },
        { id: 'pinned_PS',   section: 'PS',   title: 'Psych / Soc (P/S)' },
      ];

      let existing: ChatSession[] = storedSessions ? JSON.parse(storedSessions) : [];

      // Ensure all 4 section sessions always exist (add any missing ones)
      SECTION_DEFAULTS.forEach((def, i) => {
        const has = existing.some(s => s.id === def.id || s.section === def.section);
        if (!has) {
          existing = [{
            id: def.id,
            title: def.title,
            createdAt: now - i,
            section: def.section,
            stage: 'intake',
            messages: [],
            drills: [],
            drillStreak: 0,
            drillHistory: []
          }, ...existing];
        }
      });

      setSessions(existing);
      setActiveSessionId(existing[0].id);

      if (storedFlashcards) {
        setFlashcards(JSON.parse(storedFlashcards));
      } else {
        setFlashcards(SEED_FLASHCARDS);
      }

      if (storedSkills) {
        setMicroSkills(JSON.parse(storedSkills));
      } else {
        setMicroSkills(SEED_MICRO_SKILLS);
      }
    } catch (e) {
      console.error('Error loading localStorage:', e);
    }
  }, []);

  // 2. State Sync back to Local Storage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('mcat_mastery_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('mcat_mastery_flashcards', JSON.stringify(flashcards));
  }, [flashcards]);

  useEffect(() => {
    if (microSkills.length > 0) {
      localStorage.setItem('mcat_mastery_skills', JSON.stringify(microSkills));
    }
  }, [microSkills]);

  // 3. Navigation handler helper
  const handleNavigateToTab = (tab: string) => {
    setActiveTab(tab);
  };

  const handleNavigateToChat = (chatId: string) => {
    setActiveSessionId(chatId);
    setActiveTab('sessions');
  };

  // 4. Session Action Managers
  const handleCreateSession = () => {
    const title = prompt('Name this study session (e.g. "Acid/Base pH Errors"):');
    if (title === null) return; // user cancelled
    const newId = `session_${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: title.trim() || `Study Session #${sessions.length + 1}`,
      createdAt: Date.now(),
      stage: 'intake',
      messages: [],
      drills: [],
      drillStreak: 0,
      drillHistory: []
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newId);
    setActiveTab('sessions');
  };

  const handleRenameSession = (id: string) => {
    const newTitle = prompt('Type new name for this study session:');
    if (!newTitle?.trim()) return;

    setSessions(sessions.map(s => s.id === id ? { ...s, title: newTitle } : s));
  };

  const handleDeleteSession = (id: string) => {
    if (confirm('Are you sure you want to delete this session diagnostic record?')) {
      const remaining = sessions.filter(s => s.id !== id);
      setSessions(remaining);
      if (activeSessionId === id && remaining.length > 0) {
        setActiveSessionId(remaining[0].id);
      } else if (remaining.length === 0) {
        setActiveSessionId('');
      }
    }
  };

  const handleUpdateSession = (updated: ChatSession) => {
    setSessions(sessions.map(s => s.id === updated.id ? updated : s));
  };

  // 5. Flashcard state updater
  const handleAddFlashcard = (card: Flashcard) => {
    setFlashcards([card, ...flashcards]);
  };

  const handleUpdateCard = (updatedCard: Flashcard) => {
    setFlashcards(flashcards.map(c => c.id === updatedCard.id ? updatedCard : c));
  };

  const handleDeleteCard = (cardId: string) => {
    if (confirm('Delete this card from spacing deck?')) {
      setFlashcards(flashcards.filter(c => c.id !== cardId));
    }
  };

  // 6. MicroSkill State management
  const handleUpdateMicroSkill = (skill: MicroSkill) => {
    const exists = microSkills.find(s => s.id === skill.id || s.name === skill.name);
    if (exists) {
      setMicroSkills(microSkills.map(s => (s.id === skill.id || s.name === skill.name) ? { ...s, ...skill } : s));
    } else {
      setMicroSkills([skill, ...microSkills]);
    }
  };

  // Select active session object
  const activeSessionObj = sessions.find(s => s.id === activeSessionId) || sessions[0];

  return (
    <div className="min-h-screen bg-[#fbfbfa] text-[#37352f] flex flex-col font-sans" id="app-root">
      
      {/* Top Navigation banner - Styled like Notion Top Bar */}
      <header className="bg-white border-b border-[#e4e4e3] sticky top-0 z-40 navbar" id="top-navbar">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center h-12">
          
          {/* Logo brand - Clean Notion-style workspaces */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('dashboard')} id="logo-branding">
            <div className="w-5 h-5 bg-[#37352f] rounded text-[#fbfbfa] text-xs font-bold flex items-center justify-center font-sans">
              M
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold text-[#37352f] text-sm tracking-tight font-sans">MCAT Mastery Workspace</span>
              <span className="text-[10px] text-zinc-400 font-sans tracking-wide uppercase">Practice-First</span>
            </div>
          </div>

          {/* Core tabs navigation */}
          <nav className="hidden md:flex gap-1" id="nav-tabs">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={13} /> },
              { id: 'sessions', label: 'Socratic Coach', icon: <BookOpen size={13} /> },
              { id: 'srs', label: 'Spaced Recall Queue', icon: <Layers size={13} /> },
              { id: 'quiz', label: 'Interleaved Quizzes', icon: <Sparkles size={13} /> }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#efeee3] text-[#37352f] font-semibold'
                    : 'bg-transparent text-[#37352f]/60 hover:bg-[#f1f1ef] hover:text-[#37352f]'
                }`}
                id={`tab-btn-${tab.id}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right utility */}
          <div className="flex items-center gap-3" id="top-utility">
            <span className="text-[10px] bg-[#f1f1ef] px-2 py-0.5 rounded text-[#37352f]/70 font-sans font-medium border border-[#e4e4e3]">
              MCAT STUDY LAB
            </span>
          </div>

        </div>
      </header>

      {/* Mobile view top nav helper */}
      <div className="flex md:hidden bg-white border-b border-[#e4e4e3] justify-around py-2" id="mobile-tabs-helper">
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'sessions', label: 'Coaching' },
          { id: 'srs', label: 'Queue' },
          { id: 'quiz', label: 'Quiz' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
              activeTab === tab.id ? 'bg-[#efeee3] text-[#37352f] font-bold' : 'text-[#37352f]/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Container workspace */}
      <main className="flex-1 py-6 bg-white" id="workspace-main">
        
        {/* TAB 1: ANALYTICS DASHBOARD */}
        {activeTab === 'dashboard' && (
          <AnalyticsDashboard
            microSkills={microSkills}
            flashcards={flashcards}
            sessions={sessions}
            onNavigateToTab={handleNavigateToTab}
            onNavigateToChat={handleNavigateToChat}
          />
        )}

        {/* TAB 2: STUDY SESSIONS (CHAT SIDEBAR SPLIT) */}
        {activeTab === 'sessions' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-7xl mx-auto px-6" id="sessions-layout-container">
            
            {/* Left sidebar containing session lists */}
            <div className="md:col-span-2 space-y-4 bg-[#f7f7f5] p-3.5 border border-[#e4e4e3] rounded-lg h-fit" id="chats-sidebar">
              <div className="flex justify-between items-center pb-2 border-b border-[#e4e4e3]" id="sidebar-action">
                <span className="text-xs font-bold text-[#37352f]/70 font-sans tracking-wide">STUDY SESSIONS</span>
                <button
                  onClick={handleCreateSession}
                  className="p-1 hover:bg-[#efeee3] text-[#37352f] rounded border border-[#e4e4e3] bg-white text-xs flex items-center justify-center cursor-pointer transition-colors"
                  id="create-new-chat-btn"
                  title="Create New Session"
                >
                  <Plus size={13} />
                </button>
              </div>

              {/* Sessions listing */}
              <div className="space-y-1 max-h-[500px] overflow-y-auto" id="sidebar-sessions-list">
                {sessions.length === 0 ? (
                  <p className="text-center text-xs text-[#37352f]/40 py-6 font-sans">No sessions created yet.</p>
                ) : (
                  sessions.map((item) => {
                    const isSelected = item.id === activeSessionId;
                    return (
                      <div
                        key={item.id}
                        className={`group p-2.5 rounded flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-white border border-[#e4e4e3] shadow-[0_1px_2px_rgba(15,15,15,0.05)] font-semibold text-[#37352f]' 
                            : 'bg-transparent text-[#37352f]/70 border border-transparent hover:bg-[#efeee3]/60'
                        }`}
                        onClick={() => setActiveSessionId(item.id)}
                        id={`session-sidebar-card-${item.id}`}
                      >
                        <div className="flex items-center gap-2 truncate max-w-[70%]" id={`session-title-label-${item.id}`}>
                          <MessageSquare size={12} className="text-[#37352f]/40 shrink-0" />
                          <div className="truncate">
                            <span className="text-[9px] text-[#37352f]/40 font-sans uppercase block tracking-wider font-semibold">
                              {item.stage}
                            </span>
                            <span
                              className="text-xs truncate font-sans block font-semibold hover:text-[#37352f] cursor-text"
                              title="Double-click to rename"
                              onDoubleClick={(e) => { e.stopPropagation(); handleRenameSession(item.id); }}
                            >
                              {item.title}
                            </span>
                          </div>
                        </div>

                        {/* Hover actions buttons */}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" id={`session-card-actions-${item.id}`}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRenameSession(item.id); }}
                            className="p-0.5 text-[#37352f]/50 hover:text-[#37352f]/90 hover:bg-[#e4e4e3] rounded cursor-pointer"
                            title="Rename Session"
                          >
                            <PenTool size={10} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteSession(item.id); }}
                            className="p-0.5 text-[#37352f]/50 hover:text-red-650 hover:bg-red-50 rounded cursor-pointer"
                            title="Delete Session"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right main workspace loading the active chat */}
            <div className="md:col-span-10" id="active-dialogue-col">
              {activeSessionId && activeSessionObj ? (
                <ActiveChatSession
                  key={activeSessionId}
                  session={activeSessionObj}
                  onUpdateSession={handleUpdateSession}
                  onAddFlashcard={handleAddFlashcard}
                  onUpdateMicroSkill={handleUpdateMicroSkill}
                />
              ) : (
                <div className="bg-[#f7f7f5] border border-[#e4e4e3] rounded-lg p-16 text-center text-[#37352f]/60 text-xs py-24" id="no-chat-chosen">
                  Click the plus icon (+) in the sidebar or select an active session on the left to activate Socratic coaching.
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 3: SPACED REPETITION QUEUE */}
        {activeTab === 'srs' && (
          <SpacedRepetitionDeck
            cards={flashcards}
            onUpdateCard={handleUpdateCard}
            onDeleteCard={handleDeleteCard}
          />
        )}

        {/* TAB 4: INTERLEAVING QUIZ */}
        {activeTab === 'quiz' && (
          <InterleavingQuizRunner
            microSkills={microSkills}
          />
        )}

      </main>

      {/* Minimal Academic Footer */}
      <footer className="bg-[#f7f7f5] border-t border-[#e4e4e3] py-4 text-center text-[10px] text-[#37352f]/50 font-sans" id="footer-branding">
        <p>© 2026 MCAT Mistake to Mastery Socratic Accelerator. Under strict active retrieval parameters.</p>
        <p className="mt-0.5 text-[9px] text-zinc-300">Port 3000 Ingress Secure | Notion Simple Design Theme</p>
      </footer>

    </div>
  );
}

