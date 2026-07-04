// Defines the possible roles a user can have
export type UserRole = 'debater' | 'audience';

// Defines the structure of a User object
export interface User {
  id: string;
  username: string;
  role?: UserRole; //Optional
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

// Defines the user object specific to its role within a debate
export interface DebaterInDebate extends Omit<User, 'role' | 'password'> {
  position: DebaterPosition;
}

// Defines the possible statuses of a debate
export type DebateStatus = 'live' | 'scheduled' | 'completed' | 'pending';

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
  timeRemaining: number; // in seconds
  startedAt: string; // ISO 8601 date string
  messages?: Message[];
  scores?: { debater1: number; debater2: number };
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

// Defines the structure of a Message object within a debate
export interface Message {
  id: string;
  debaterId: string;
  debaterName: string;
  message: string;
  messageId:string,
  timestamp: string; // ISO 8601 date string
  factCheckStatus: FactCheckStatus;
  round: number;
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
