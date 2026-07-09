import React, {
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type ChangeEvent,
  type JSX,
  useCallback,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Send,
  Clock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  Copy,
  Trophy,
  Info,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { useAuth } from "../contexts/AuthContext";
import type { Debate, Message, User, ExchangeResult } from "@/types";
import { getDebateById, postMessage, completeDebate } from "@/api/debateAPI";
import { useSocket } from "@/contexts/SocketContext";

// --- Isolated Timer Component to prevent full-page re-renders ---
// `expectedEndAt` is the server's authoritative end time for this debate.
// Deriving the countdown from it (instead of a static "150 seconds" prop)
// means: refreshing the page doesn't reset the clock, and a debate that
// nobody's browser is watching still has a real, computable end time that
// the SERVER can act on (see server.js sweep) instead of relying on a
// client's setInterval to ever fire completeDebate().
const DebateTimer: React.FC<{ expectedEndAt: string | null | undefined; fallbackSeconds: number; onTimeEnd: () => void }> = ({
  expectedEndAt,
  fallbackSeconds,
  onTimeEnd,
}) => {
  const computeSeconds = useCallback(() => {
    if (expectedEndAt) {
      const remainingMs = new Date(expectedEndAt).getTime() - Date.now();
      return Math.max(0, Math.round(remainingMs / 1000));
    }
    return fallbackSeconds;
  }, [expectedEndAt, fallbackSeconds]);

  const [seconds, setSeconds] = useState(computeSeconds);

  // Re-sync whenever the server tells us a new expectedEndAt (e.g. debate-updated)
  useEffect(() => {
    setSeconds(computeSeconds());
  }, [expectedEndAt, computeSeconds]);

  useEffect(() => {
    if (seconds > 0) {
      const timer = setInterval(() => setSeconds(computeSeconds()), 1000);
      return () => clearInterval(timer);
    } else {
      onTimeEnd();
    }
  }, [seconds, onTimeEnd, computeSeconds]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const formattedTime = `${mins}:${secs < 10 ? "0" : ""}${secs}`;

  return (
    <div className={`flex items-center space-x-2 ${seconds < 10 ? "animate-pulse" : ""}`}>
      <Clock className={`w-5 h-5 ${seconds < 10 ? "text-red-400" : "text-slate-400"}`} />
      <p className={`text-xl font-bold ${seconds < 10 ? "text-red-400" : "text-white"}`}>
        {formattedTime}
      </p>
    </div>
  );
};

const DebatePage: React.FC = () => {
  const { debateId } = useParams<{ debateId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageCounterRef = useRef(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [debate, setDebate] = useState<Debate | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>("");
  const [isTimeUp, setIsTimeUp] = useState<boolean>(false);
  const [currentTurn, setCurrentTurn] = useState<"debater1" | "debater2" | null>(null);
  const [showTurnBanner, setShowTurnBanner] = useState<boolean>(false);
  const [currentTurnUser, setCurrentTurnUser] = useState<User | null>(null);
  const [scores, setScores] = useState<{ debater1: number; debater2: number }>({ debater1: 0, debater2: 0 });
  const [lastExchange, setLastExchange] = useState<ExchangeResult | null>(null);
  const [exchangeHistory, setExchangeHistory] = useState<ExchangeResult[]>([]);
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const socket = useSocket();

  // Color is tied to WHICH debater sent it
  const getBubbleClasses = (debaterId: string) =>
    debate?.debater1.id === debaterId
      ? "bg-slate-700 text-white"
      : "bg-slate-800 text-slate-200";

  function generateMessageId() {
    messageCounterRef.current += 1;
    return `${Date.now()}-${messageCounterRef.current}`;
  }

  // --- Load Debate Data ---
  useEffect(() => {
    if (!debateId) {
      navigate("/dashboard");
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const debateData = await getDebateById(debateId);

        if (debateData) {
          setDebate(debateData);
          setCurrentTurn(debateData.currentTurn);
          if (debateData.timeRemaining <= 0) setIsTimeUp(true);
          if (debateData.messages && debateData.messages.length > 0) {
            setMessages(debateData.messages);
          }
          if (debateData.scores) {
            setScores(debateData.scores);
          }

          if (debateData.exchangeHistory) {
            setExchangeHistory(debateData.exchangeHistory);
          }
          if (debateData.status === "completed") {
            setIsTimeUp(true);
          }

        } else {
          toast.error("Error", { description: "Debate not found." });
          navigate("/dashboard");
        }
      } catch (error) {
        toast.error("Error", { description: "Failed to load debate data." });
        navigate("/dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [debateId, navigate]);

  // --- Join Socket Room ---
  useEffect(() => {
    if (!socket || !debateId) return;

    const joinRoom = () => {
      socket.emit("join-debate", debateId);
    };

    if (socket.connected) {
      joinRoom();
    } else {
      socket.once("connect", joinRoom);
    }

    socket.on("reconnect", joinRoom);

    return () => {
      socket.off("connect", joinRoom);
      socket.off("reconnect", joinRoom);
    };
  }, [socket, debateId]);

  // --- Socket Message Listener ---
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (message: any) => {
      setMessages((prevMessages) => {
        const isDuplicate = prevMessages.some((msg) => msg.messageId === message.messageId);
        if (isDuplicate) return prevMessages;
        return [...prevMessages, message];
      });

      if (message.nextTurn) {
        setCurrentTurn(message.nextTurn as "debater1" | "debater2");
      }
    };

    const handleDebateUpdated = (updatedDebate: Debate) => {
      setDebate(updatedDebate);
      setCurrentTurn(updatedDebate.currentTurn);
      // Server may auto-complete a debate (time expired sweep) even while
      // no one had this tab open to trigger it locally — reflect that here.
      if (updatedDebate.status === "completed") {
        setIsTimeUp(true);
        setShowEndModal(true);
      }
    };

    const handleExchangeScored = (data: { scores: { debater1: number; debater2: number }; exchange: ExchangeResult }) => {
      setScores(data.scores);
      setLastExchange(data.exchange);
      setExchangeHistory((prev) => [...prev, data.exchange]);
      setTimeout(() => setLastExchange(null), 8000);
    };

    socket.on("real-time-sync-message", handleMessage);
    socket.on("debate-updated", handleDebateUpdated);
    socket.on("exchange-scored", handleExchangeScored);

    return () => {
      socket.off("real-time-sync-message", handleMessage);
      socket.off("debate-updated", handleDebateUpdated);
      socket.off("exchange-scored", handleExchangeScored);
    };
  }, [socket]);

  // --- Memoized Time Up Handler ---
  const handleTimeEnd = useCallback(() => {
    setIsTimeUp(true);
    setShowEndModal(true);
    if (debate?.id) {
      completeDebate(debate.id).catch((e) => {
        console.log("Error: ", e);
      });
    }
  }, [debate?.id]);

  // --- Scroll to Latest Message ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Handle Send ---
  const handleSendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newMessage.trim() || !debate || !user || !currentTurn || isTimeUp) return;

    const isParticipant = user.id === debate.debater1.id || user.id === debate.debater2.id;
    if (!isParticipant) {
      toast.warning("Spectator", { description: "Only the two debaters can send messages." });
      return;
    }
    if (!isMyTurn) {
      toast.warning("Not your turn", { description: "Wait for your opponent to finish" });
      return;
    }

    const messageData: Omit<Message, "id"> = {
      debaterId: user.id,
      debaterName: user.username,
      message: newMessage,
      messageId: generateMessageId(),
      timestamp: new Date().toISOString(),
      factCheckStatus: "pending",
      round: debate.currentRound,
    };

    try {
      await postMessage(debate.id, messageData, socket);
      setNewMessage("");

      const nextTurn = currentTurn === "debater1" ? "debater2" : "debater1";
      const nextTurnUser = nextTurn === "debater1" ? debate.debater1 : debate.debater2;

      setCurrentTurn(nextTurn);
      setCurrentTurnUser(nextTurnUser as User);
      setShowTurnBanner(true);
      setTimeout(() => setShowTurnBanner(false), 3000);
    } catch (error) {
      toast.error("Error", { description: "Could not send message." });
    }
  };

  const getInitials = (name: string): string =>
    name.split("_").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const getFactCheckIcon = (status: Message["factCheckStatus"]): JSX.Element => {
    if (status === "verified") return <ShieldCheck className="w-4 h-4 text-green-400" />;
    if (status === "questionable") return <ShieldAlert className="w-4 h-4 text-yellow-400" />;
    if (status === "pending") return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    return <Shield className="w-4 h-4 text-slate-500" />;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-white animate-spin" />
      </div>
    );
  }

  if (!debate) return null;

  const isDebater1 = user?.id === debate.debater1.id;
  const isDebater2 = user?.id === debate.debater2?.id;
  const isMyTurn = (currentTurn === "debater1" && isDebater1) || (currentTurn === "debater2" && isDebater2);
  // Spectator status is derived purely from whether this user is actually
  // seated as debater1/debater2 on THIS debate. Seats are only ever filled
  // via debate creation or PUT /api/debates/:id/join (which requires knowing
  // the debate's id). So anyone who lands in a room without having been
  // placed into a seat that way is simply audience — never a participant.
  const isAudience = !isDebater1 && !isDebater2;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard")}
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
              Live Debate
            </Badge>
          </div>
        </header>

        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <Card className="p-6 bg-slate-900/50 border-slate-700 sticky top-24">
                <h3 className="text-md font-bold text-white ">Topic</h3>
                <p className="text-slate-300 mb-2">{debate.topic.title}</p>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Round</p>
                    <p className="text-xl font-bold text-white">
                      {debate.currentRound} / {debate.totalRounds}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-2">Time Remaining</p>
                    <DebateTimer
                      expectedEndAt={debate.expectedEndAt}
                      fallbackSeconds={debate.timeRemaining}
                      onTimeEnd={handleTimeEnd}
                    />
                  </div>
                  <div className="pt-4 border-t border-slate-700">
                    <p className="text-sm text-slate-400 mb-3">Debaters</p>
                    <div className="space-y-3">
                      {[debate.debater1, debate.debater2].map((deb, i) => (
                        <div
                          key={deb.id}
                          className={`p-3 rounded-lg ${
                            currentTurn === `debater${i + 1}`
                              ? "bg-slate-700/50 border-2 border-slate-600"
                              : "bg-slate-800"
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Avatar className="w-8 h-8 bg-slate-700">
                              <AvatarFallback className="text-xs">
                                {getInitials(deb.username)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-white">
                                {deb.username}
                              </p>
                              <p className="text-xs text-slate-400">
                                {deb.position}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-700">
                    <p className="text-sm text-slate-400 mb-3">Live Score</p>
                    <div className="space-y-2">
                      {[debate.debater1, debate.debater2].map((deb, i) => {
                        const debKey = i === 0 ? "debater1" : "debater2";
                        const pts = scores[debKey as keyof typeof scores];
                        return (
                          <div key={deb.id} className="flex items-center justify-between p-2 bg-slate-800 rounded-lg">
                            <span className="text-sm text-slate-300 truncate max-w-[100px]">{deb.username}</span>
                            <span className="text-lg font-bold text-white">{pts.toFixed(1)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-sm font-semibold text-white mb-1 p-4 bg-slate-700/50 border-2 border-slate-600 rounded-lg flex items-center justify-between">
                  <span>Room: {debateId?.slice(0, 8)}...</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(debateId || "");
                      toast.success("Copied!", { description: "Room ID copied" });
                    }}
                    className="text-slate-300 hover:text-white transition"
                  >
                    <Copy className="w-5 h-5 cursor-pointer" />
                  </button>
                </div>
              </Card>
            </div>

            <div className="lg:col-span-3">
              <Card className="bg-slate-900/50 border-slate-700 h-[calc(100vh-200px)] flex flex-col">
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <AnimatePresence>
                    {messages.map((msg, index) => {
                      const isOwnMessage = msg.debaterId === user?.id;
                      const bubbleClasses = getBubbleClasses(msg.debaterId);
                      const hasAnalysis = !!msg._aiData;

                      return (
                        <motion.div
                          key={msg.messageId || index}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                        >
                          <div className={`max-w-[70%] ${isOwnMessage ? "items-end" : "items-start"} flex flex-col`}>
                            <div className="flex items-center space-x-2 mb-1">
                              <p className="text-xs text-slate-400">{msg.debaterName}</p>
                              <p className="text-xs text-slate-500">
                                {new Date(msg.timestamp).toLocaleTimeString()}
                              </p>
                            </div>

                            <div className={`p-4 rounded-lg ${bubbleClasses}`}>
                              <p className="text-sm leading-relaxed">{msg.message}</p>

                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.3 }}
                                className="flex items-center space-x-1 mt-2"
                              >
                                {getFactCheckIcon(msg.factCheckStatus)}
                                <span
                                  className={`text-xs ${
                                    msg.factCheckStatus === "verified"
                                      ? "text-green-300"
                                      : msg.factCheckStatus === "questionable"
                                      ? "text-yellow-300"
                                      : msg.factCheckStatus === "pending"
                                      ? "text-blue-200"
                                      : "text-slate-300"
                                  }`}
                                >
                                  {msg.factCheckStatus}
                                </span>

                                {/* RADIX TOOLTIP FOR ANALYSIS */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="w-4 h-4 ml-1 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/35 transition cursor-help outline-none"
                                      aria-label="View analysis"
                                    >
                                      <Info className="w-3 h-3 text-white/80" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side={isOwnMessage ? "left" : "right"}
                                    align="end"
                                    sideOffset={8}
                                    className="w-80 p-4 bg-slate-950 border border-slate-700 shadow-2xl z-[100] text-left"
                                  >
                                    {hasAnalysis ? (
                                      <div className="space-y-3">
                                        <p className="text-xs font-semibold text-white mb-2">Analysis</p>
                                        <div className="flex justify-between text-xs mb-1">
                                          <span className="text-slate-400">Factual score</span>
                                          <span className="text-slate-200 font-medium">
                                            {msg._aiData!.factual_score.toFixed(0)}%
                                          </span>
                                        </div>
                                        <div className="flex justify-between text-xs mb-2">
                                          <span className="text-slate-400">Relevance score</span>
                                          <span className="text-slate-200 font-medium">
                                            {msg._aiData!.relevance_score.toFixed(0)}%
                                          </span>
                                        </div>

                                        <div className="border-t border-slate-800 mt-2 pt-2 space-y-3">
                                          <div>
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                              Factual Analysis
                                            </span>
                                            <p className="text-xs text-slate-300 leading-relaxed mt-1">
                                              {msg._aiData!.fact_explanation || msg._aiData!.reasoning || "No factual analysis provided."}
                                            </p>
                                          </div>
                                          <div>
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                              Discourse Logic
                                            </span>
                                            <p className="text-xs text-slate-400 leading-relaxed mt-1">
                                              {msg._aiData!.relevance_reason || "No discourse logic provided."}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-slate-400">
                                        No analysis available for this message yet.
                                      </p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </motion.div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>

                <AnimatePresence>
                  {showTurnBanner && currentTurnUser && (
                    <motion.div
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="mx-6 mb-4 p-4 bg-slate-800 border-2 border-slate-600 rounded-lg text-center"
                    >
                      <p className="text-white font-semibold">
                        {currentTurnUser.username}'s Turn
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {lastExchange && debate && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="mx-6 mb-4 p-4 bg-slate-800 border-2 border-yellow-500/40 rounded-lg"
                    >
                      <p className="text-yellow-400 font-bold text-sm mb-2">
                        Exchange Result —{" "}
                        {lastExchange.winner === "tie"
                          ? "It's a Tie!"
                          : `${lastExchange.winner === "for" ? (debate.debater1.position === "for" ? debate.debater1.username : debate.debater2.username) : (debate.debater1.position === "against" ? debate.debater1.username : debate.debater2.username)} wins this round`}
                      </p>
                      <div className="flex justify-between text-xs text-slate-300 mb-2">
                        <span>FOR: +{lastExchange.forUser.points.toFixed(1)} pts</span>
                        <span>AGAINST: +{lastExchange.againstUser.points.toFixed(1)} pts</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{lastExchange.reasoning}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="p-6 border-t border-slate-700">
                  {isAudience ? (
                    <div className="text-center text-slate-400 py-4">
                      You are watching this debate. Only debaters can send messages.
                    </div>
                  ) : (
                    <form onSubmit={handleSendMessage} className="flex space-x-2">
                      <Input
                        value={newMessage}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewMessage(e.target.value)}
                        placeholder={isMyTurn ? "Type your message..." : "Wait for your turn..."}
                        disabled={!isMyTurn || isTimeUp}
                        className="flex-1 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                      />
                      <Button
                        type="submit"
                        disabled={!isMyTurn || !newMessage.trim() || isTimeUp}
                        className="bg-slate-700 hover:bg-slate-600"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </form>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showEndModal && debate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
              >
                <div className="p-6 border-b border-slate-700 text-center">
                  <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
                  <h2 className="text-2xl font-bold text-white">Debate Complete</h2>
                  <p className="text-slate-400 text-sm mt-1">{debate.topic.title}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Final Scores</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {[debate.debater1, debate.debater2].map((deb, i) => {
                        const debKey = i === 0 ? "debater1" : "debater2";
                        const pts = scores[debKey as keyof typeof scores];
                        const otherKey = i === 0 ? "debater2" : "debater1";
                        const otherPts = scores[otherKey as keyof typeof scores];
                        const isWinner = pts > otherPts;
                        const isTie = pts === otherPts;
                        return (
                          <div
                            key={deb.id}
                            className={`p-4 rounded-xl border-2 text-center ${
                              isWinner
                                ? "border-yellow-400 bg-yellow-400/10"
                                : isTie
                                ? "border-slate-500 bg-slate-800"
                                : "border-slate-700 bg-slate-800/50"
                            }`}
                          >
                            {isWinner && <p className="text-xs text-yellow-400 font-bold mb-1">WINNER</p>}
                            {isTie && <p className="text-xs text-slate-400 font-bold mb-1">TIE</p>}
                            <p className="text-white font-semibold">{deb.username}</p>
                            <p className="text-xs text-slate-400 mb-2">{deb.position}</p>
                            <p className="text-3xl font-bold text-white">{pts.toFixed(1)}</p>
                            <p className="text-xs text-slate-500">points</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {exchangeHistory.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Exchange History ({exchangeHistory.length} round{exchangeHistory.length > 1 ? "s" : ""})
                      </h3>
                      <div className="space-y-3">
                        {exchangeHistory.map((ex, idx) => {
                          const forDebater = debate.debater1.position === "for" ? debate.debater1 : debate.debater2;
                          const againstDebater = debate.debater1.position === "against" ? debate.debater1 : debate.debater2;
                          return (
                            <div key={idx} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-400 uppercase">Exchange {idx + 1}</span>
                                <span
                                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    ex.winner === "tie"
                                      ? "bg-slate-700 text-slate-300"
                                      : ex.winner === "for"
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-blue-500/20 text-blue-400"
                                  }`}
                                >
                                  {ex.winner === "tie"
                                    ? "Tie"
                                    : ex.winner === "for"
                                    ? `${forDebater.username} won`
                                    : `${againstDebater.username} won`}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                                  <p className="text-xs text-green-400 font-semibold mb-1">FOR — {forDebater.username}</p>
                                  <p className="text-xl font-bold text-white">+{ex.forUser.points.toFixed(1)}</p>
                                </div>
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                                  <p className="text-xs text-blue-400 font-semibold mb-1">AGAINST — {againstDebater.username}</p>
                                  <p className="text-xl font-bold text-white">+{ex.againstUser.points.toFixed(1)}</p>
                                </div>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed">{ex.reasoning}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {exchangeHistory.length === 0 && (
                    <p className="text-slate-500 text-sm text-center">No scored exchanges recorded.</p>
                  )}
                </div>

                <div className="p-6 border-t border-slate-700">
                  <Button
                    onClick={() => navigate("/dashboard")}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-white"
                  >
                    Back to Dashboard
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
};

export default DebatePage;