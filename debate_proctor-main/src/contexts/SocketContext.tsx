import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
  socket: Socket | null;
}

interface SocketProviderProps {
  children: ReactNode;
}

const SocketContext = createContext<SocketContextType | null>(null);

// Fixed: Return Socket | null instead of Socket!
export function useSocket(): Socket | null {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error("useSocket must be used inside <SocketProvider>");
  }

  return context.socket;
}

export const SocketProvider = ({ children }: SocketProviderProps) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const url = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

  useEffect(() => {
    console.log("🔌 Initializing socket connection to:", url);
    
    const newSocket: Socket = io(url, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    newSocket.on("connect", () => {
      console.log("✅ Socket connected successfully:", newSocket.id);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected:", reason);
    });

    newSocket.on("error", (error) => {
      console.error("❌ Socket error:", error);
    });

    setSocket(newSocket);

    return () => {
      console.log("🔌 Disconnecting socket");
      newSocket.disconnect();
    };
  }, []); // Remove 'url' from dependencies to prevent reconnections

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};