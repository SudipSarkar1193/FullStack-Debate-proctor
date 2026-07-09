// Defines the structure of a User object
export interface User {
  id: string;
  username: string;
  password?: string; // Optional 
}

// Defines the structure of a Topic object
export interface Topic {
  id: string;
  title: string;
  category: string;
}

// Defines the possible positions in a debate
export type DebaterPosition = 'for' | 'against';

// Defines the user object specific to a debate seat (debater1/debater2)
export interface DebaterInDebate extends Omit<User, 'password'> {
  position: DebaterPosition;
}

// Defines the possible statuses of a debate
// 'expired' = an open challenge nobody joined within the pending window,
// auto-marked by the server sweep (see server.js). Kept distinct from
// 'completed' so the dashboard/history can tell "played out" apart from
// "nobody showed up".
export type DebateStatus = 'live' | 'scheduled' | 'completed' | 'pending' | 'expired';

// Defines whose turn it is in the debate
export type DebateTurn = 'debater1' | 'debater2';

// Defines the structure of a Debate object
export interface Debate {
  id: string;
  topic: Topic;
  debater1: DebaterInDebate;
  debater2: DebaterInDebate;
  status: DebateStatus;
  currentRound: number;
  totalRounds: number;
  currentTurn: DebateTurn;
  completedAt?: string | null;
  timeRemaining: number; // in seconds — legacy fallback only
  startedAt: string; // ISO 8601 date string
  // --- Server-authoritative timing (set when the debate goes live) ---
  liveStartedAt?: string; // ISO 8601, set the moment the opponent joins
  expectedEndAt?: string; // ISO 8601, liveStartedAt + totalRounds * roundDuration
  autoCompletedReason?: string; // present if the server sweep ended this debate, not a client
  messages?: Message[];
  scores?: { debater1: number; debater2: number };
  exchangeHistory?: ExchangeResult[];
}

// Defines the result of one complete For+Against exchange scored by the LLM
export interface ExchangeResult {
  forUser: { id: string; points: number };
  againstUser: { id: string; points: number };
  winner: "for" | "against" | "tie";
  reasoning: string;
}

// Defines the possible statuses for fact-checking
export type FactCheckStatus = 'verified' | 'questionable' | 'pending' | 'unverified';


export interface MessageAIData {
  factual_score: number;
  relevance_score: number;
  reasoning?: string; // Kept for backwards compatibility 
  fact_explanation?: string; // The hard Wikipedia facts
  relevance_reason?: string; // The discourse logic
}

// Defines the structure of a Message object within a debate
export interface Message {
  id: string;
  debaterId: string;
  debaterName: string;
  message: string;
  messageId: string;
  timestamp: string;
  factCheckStatus: FactCheckStatus;
  round: number;
  _aiData?: MessageAIData; // present once Python analysis completes
}


// Defines the structure for challenge requests
export interface Challenge {
    id: string;
    challenger: Pick<User, 'id' | 'username'>; // User making the challenge
    challenged?: Pick<User, 'id' | 'username'>; // Optional: User being challenged
    topic: Topic;
    position: DebaterPosition;
    status: 'pending' | 'accepted' | 'declined';
    createdAt: string; // ISO 8601 date string
}