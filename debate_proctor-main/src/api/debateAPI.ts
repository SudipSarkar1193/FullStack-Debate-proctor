import { mockTopics, mockUsers } from "../mock/mockData";
import type { Debate, Topic, Message, User, Challenge, DebaterPosition } from "../types";
import type { Socket } from "socket.io-client";


// Get URL from .env (or default to localhost for safety)
const API_URL = import.meta.env.VITE_SERVER_URL;

// --- AUTH (Mock) ---
export const loginUser = async (
  username: string,
  password: string,
): Promise<User | null> => {
  const user = mockUsers.find(
    (u) => u.username === username && u.password === password 
  );
  return user || null;
};

// --- DEBATES ---

export const getDebateById = async (id: string): Promise<Debate | undefined> => {
  try {
    const response = await fetch(`${API_URL}/api/debates/${id}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return undefined;
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch debate:", error);
    return undefined;
  }
};

export const getDebates = async (
  params?: { userId?: string; status?: string }
): Promise<Debate[]> => {
  try {
    const query = new URLSearchParams();
    if (params?.userId) query.set("userId", params.userId);
    if (params?.status) query.set("status", params.status);
    const qs = query.toString();

    const response = await fetch(`${API_URL}/api/debates${qs ? `?${qs}` : ""}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch debates:", error);
    return [];
  }
};

export const completeDebate = async (debateId: string): Promise<Debate | undefined> => {
  try {
    const response = await fetch(`${API_URL}/api/debates/${debateId}/complete`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return undefined;
    return await response.json();
  } catch (error) {
    console.error("Failed to mark debate complete:", error);
    return undefined;
  }
};

export const joinDebate = async (debateId: string, user: User): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/api/debates/${debateId}/join`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debater2: { id: user.id, username: user.username } }),
    });
    return response.ok;
  } catch (error) {
    console.error("Failed to join debate:", error);
    return false;
  }
};

// --- MESSAGES ---
export const postMessage = async (
  debateId: string,
  message: Omit<Message, "id">,
  socket: Socket | null
): Promise<Message> => {
  if (!socket || !socket.connected) {
    throw new Error("Socket not connected to server");
  }

  console.log("🚀 Emitting sendMsg with debateId:", debateId);
  console.log("🚀 Message data:", message);

  // ✅ Send the message WITHOUT adding 'id' field
  // The backend will add it when saving to DB
  socket.emit("sendMsg", { debateId, message });

  // Return the message (it will come back via socket listener)
  return message as Message;
};

// --- TOPICS & USERS (Mock) ---
export const getTopics = async (): Promise<Topic[]> => Promise.resolve(mockTopics);
export const getUsers = async (role?: "debater" | "audience"): Promise<User[]> => {
  if (role) return Promise.resolve(mockUsers.filter((u) => u.role === role));
  return Promise.resolve(mockUsers);
};

// --- CHALLENGES ---

function generateRandomKey(): string {
  return "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".replace(/[x]/g, () => {
    return ((Math.random() * 16) | 0).toString(16);
  });
}

export const createChallenge = async (
  challenger: User,
  topicId: string,
  position: DebaterPosition
): Promise<Challenge> => {
  const topic = mockTopics.find((t) => t.id === topicId);
  if (!topic) throw new Error("Topic not found");

  const newId = generateRandomKey();

  // Construct the object strictly as the backend expects it
  const payload = {
    id: newId,
    topic: topic,
    debater1: { id: challenger.id, username: challenger.username },
    position: position
  };

  const response = await fetch(`${API_URL}/api/debates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  console.log("response",response)

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Backend Error: ${err}`);
  }

  const createdDebate = await response.json();

  return {
    id: createdDebate.id,
    challenger: { id: createdDebate.debater1.id, username: createdDebate.debater1.username },
    topic: createdDebate.topic,
    position: createdDebate.debater1.position as DebaterPosition,
    status: createdDebate.status,
    createdAt: createdDebate.startedAt || new Date().toISOString(),
  };
};