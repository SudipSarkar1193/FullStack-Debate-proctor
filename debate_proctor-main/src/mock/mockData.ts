import type { User, Topic, Debate, Message, Challenge } from "@/types";

// =================================================================
// MOCK DATA SOURCE
// This file contains the raw data used by the mock API.
// =================================================================

// Mock Users
export const mockUsers: User[] = [
  { id: "1", username: "sudip", role: "debater", password: "pass123" },
  { id: "2", username: "tubai", role: "debater", password: "pass123" },
  { id: "3", username: "sasuke", role: "debater", password: "pass123" },
  { id: "4", username: "itachi", role: "audience", password: "pass123" },
  { id: "5", username: "zenitsu", role: "audience", password: "pass123" },
];

// Mock Topics
export const mockTopics: Topic[] = [
  {
    id: "t1",
    title: "AI will replace human jobs within 10 years",
    category: "Technology",
  },
  {
    id: "t2",
    title: "Social media does more harm than good",
    category: "Society",
  },
  {
    id: "t3",
    title: "Climate change is the biggest threat to humanity",
    category: "Environment",
  },
  {
    id: "t4",
    title: "Remote work is better than office work",
    category: "Work Culture",
  },
  {
    id: "t5",
    title: "Nuclear energy is the solution to the climate crisis",
    category: "Energy",
  },
  {
    id: "t6",
    title: "Cryptocurrency will replace traditional banking",
    category: "Finance",
  },
];

// Mock Debates
export const mockDebates: Debate[] = [
  {
    id: "d1",
    topic: {
      id: "t1",
      title: "AI will replace human jobs within 10 years",
      category: "Technology",
    },
    debater1: { id: "1", username: "sudip", position: "for" },
    debater2: { id: "2", username: "sasuke", position: "against" },
    status: "live",
    currentRound: 2,
    totalRounds: 3,
    currentTurn: "debater1",
    timeRemaining: 420,
    startedAt: new Date(Date.now() - 600000).toISOString(),
  },
  {
    id: "d2",
    topic: {
      id: "t2",
      title: "Social media does more harm than good",
      category: "Society",
    },
    debater1: { id: "3", username: "tubai", position: "against" },
    debater2: { id: "1", username: "sudip", position: "for" },
    status: "live",
    currentRound: 1,
    totalRounds: 3,
    currentTurn: "debater2",
    timeRemaining: 540,
    startedAt: new Date(Date.now() - 300000).toISOString(),
  },
];

// Mock Messages (Record mapping debateId to an array of messages)
// export const mockMessages: Record<string, Message[]> = {
//   d1: [
//     {
//       id: "m1",
//       debaterId: "1",
//       debaterName: "sudip",
//       message:
//         "AI and automation are already transforming industries. Look at manufacturing - robots now perform tasks that used to require hundreds of workers.",
//       timestamp: new Date(Date.now() - 500000).toISOString(),
//       factCheckStatus: "verified",
//       round: 1,
//     },
//     {
//       id: "m2",
//       debaterId: "2",
//       debaterName: "sasuke",
//       message:
//         "While automation exists, it also creates new jobs. The tech industry has grown exponentially, creating millions of positions that didn't exist 20 years ago.",
//       timestamp: new Date(Date.now() - 480000).toISOString(),
//       factCheckStatus: "verified",
//       round: 1,
//     },
//     {
//       id: "m3",
//       debaterId: "1",
//       debaterName: "sudip",
//       message:
//         "Studies show that AI could automate 30% of current jobs by 2030. The pace of change is unprecedented.",
//       timestamp: new Date(Date.now() - 460000).toISOString(),
//       factCheckStatus: "questionable",
//       round: 2,
//     },
//   ],
//   d2: [
//     {
//       id: "m4",
//       debaterId: "3",
//       debaterName: "tubai",
//       message:
//         "Social media platforms are designed to be addictive, exploiting psychological vulnerabilities for profit.",
//       timestamp: new Date(Date.now() - 240000).toISOString(),
//       factCheckStatus: "verified",
//       round: 1,
//     },
//   ],
// };

// Mock Challenge Requests
export const mockChallenges: Challenge[] = [];
