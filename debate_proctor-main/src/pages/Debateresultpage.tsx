import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  Trophy,
  Info,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { getDebateById } from "@/api/debateAPI";
import type { Debate, Message } from "@/types";

const DebateResultPage: React.FC = () => {
  const { debateId } = useParams<{ debateId: string }>();
  const navigate = useNavigate();

  const [debate, setDebate] = useState<Debate | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!debateId) {
      navigate("/history");
      return;
    }

    const load = async () => {
      setIsLoading(true);
      const data = await getDebateById(debateId);
      setDebate(data || null);
      setIsLoading(false);
    };

    load();
  }, [debateId, navigate]);

  // Colors are tied to WHICH debater sent the message (consistent with the
  // live DebatePage), not to the viewer's own identity — this page has no
  // "own message" concept since anyone (debater or audience) can view it.
  const getBubbleClasses = (debaterId: string) =>
    debate?.debater1.id === debaterId
      ? "bg-slate-700 text-white"
      : "bg-slate-800 text-slate-200";

  const getFactCheckIcon = (status: Message["factCheckStatus"]): React.ReactElement => {
    const iconProps = { className: "w-4 h-4" };
    const icons: Record<Message["factCheckStatus"], LucideIcon> = {
      verified: ShieldCheck,
      questionable: ShieldAlert,
      pending: Loader2,
      unverified: Shield,
    };
    const Icon = icons[status] || Shield;
    const colorClass =
      status === "verified"
        ? "text-green-300"
        : status === "questionable"
        ? "text-yellow-300"
        : status === "pending"
        ? "text-blue-200 animate-spin"
        : "text-white/60";
    return <Icon className={`${iconProps.className} ${colorClass}`} />;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-white animate-spin" />
      </div>
    );
  }

  if (!debate) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-400 gap-4">
        <p>Debate not found.</p>
        <Button onClick={() => navigate("/history")} className="bg-slate-700 hover:bg-slate-600">
          Back to History
        </Button>
      </div>
    );
  }

  const messages = debate.messages || [];
  const scores = debate.scores || { debater1: 0, debater2: 0 };
  const exchangeHistory = debate.exchangeHistory || [];
  const forDebater = debate.debater1.position === "for" ? debate.debater1 : debate.debater2;
  const againstDebater = debate.debater1.position === "against" ? debate.debater1 : debate.debater2;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/history")}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to History
          </Button>
          <Badge className="bg-slate-500/10 text-slate-300 border-slate-500/20">
            {debate.status === "completed" ? "Completed" : debate.status}
          </Badge>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* --- Summary panel --- */}
          <div className="lg:col-span-1">
            <Card className="p-6 bg-slate-900/50 border-slate-700 sticky top-24">
              <h3 className="text-md font-bold text-white mb-1">Topic</h3>
              <p className="text-slate-300 mb-4">{debate.topic.title}</p>

              <div className="space-y-3">
                {[debate.debater1, debate.debater2].map((deb, i) => {
                  const debKey = i === 0 ? "debater1" : "debater2";
                  const pts = scores[debKey as keyof typeof scores];
                  const otherKey = i === 0 ? "debater2" : "debater1";
                  const otherPts = scores[otherKey as keyof typeof scores];
                  const isWinner = pts > otherPts;
                  return (
                    <div
                      key={deb.id || i}
                      className={`p-3 rounded-lg border-2 ${
                        isWinner
                          ? "border-yellow-400 bg-yellow-400/10"
                          : "border-slate-700 bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{deb.username}</p>
                          <p className="text-xs text-slate-400">{deb.position}</p>
                        </div>
                        <p className="text-xl font-bold text-white">{pts.toFixed(1)}</p>
                      </div>
                      {isWinner && (
                        <p className="text-xs text-yellow-400 font-bold mt-1">WINNER</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700 text-xs text-slate-500">
                Completed{" "}
                {debate.completedAt ? new Date(debate.completedAt).toLocaleString() : "—"}
              </div>
            </Card>
          </div>

          {/* --- Transcript + Exchange history --- */}
          <div className="lg:col-span-3 space-y-6">
            <Card className="bg-slate-900/50 border-slate-700">
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {messages.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-10">
                    No messages recorded.
                  </p>
                )}
                <AnimatePresence>
                  {messages.map((msg, index) => {
                    const isDebater1Msg = msg.debaterId === debate.debater1.id;
                    const bubbleClasses = getBubbleClasses(msg.debaterId);
                    const hasAnalysis = !!msg._aiData;

                    return (
                      <motion.div
                        key={msg.messageId || index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${isDebater1Msg ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[70%] ${
                            isDebater1Msg ? "items-start" : "items-end"
                          } flex flex-col`}
                        >
                          <div className="flex items-center space-x-2 mb-1">
                            <p className="text-xs text-slate-400">{msg.debaterName}</p>
                            <p className="text-xs text-slate-500">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </p>
                          </div>

                          <div className={`p-4 rounded-lg ${bubbleClasses}`}>
                            <p className="text-sm leading-relaxed">{msg.message}</p>

                            <div className="flex items-center space-x-1 mt-2">
                              {getFactCheckIcon(msg.factCheckStatus)}
                              <span className="text-xs text-white/80">{msg.factCheckStatus}</span>

                              {/* Info button + tooltip — hover zone spans the
                                  outer wrapper so it covers the gap between
                                  the icon and the tooltip above it. */}
                              <div
                                className="relative ml-1"
                                onMouseEnter={() => setHoveredMessageId(msg.messageId)}
                                onMouseLeave={() => setHoveredMessageId(null)}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setHoveredMessageId((cur) =>
                                      cur === msg.messageId ? null : msg.messageId
                                    )
                                  }
                                  className="w-4 h-4 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/35 transition"
                                  aria-label="View analysis"
                                >
                                  <Info className="w-3 h-3 text-white/80" />
                                </button>

                                <AnimatePresence>
                                  {hoveredMessageId === msg.messageId && (
                                    <motion.div
                                      initial={{ opacity: 0, y: 4 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: 4 }}
                                      className={`absolute z-50 bottom-6 ${
                                        isDebater1Msg ? "left-0" : "right-0"
                                      } w-64 p-3 rounded-lg bg-slate-950 border border-slate-700 shadow-xl text-left`}
                                    >
                                      {hasAnalysis ? (
                                        <>
                                          <p className="text-xs font-semibold text-white mb-2">
                                            Analysis
                                          </p>
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
                                          <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-800 pt-2">
                                            {msg._aiData!.reasoning || "No reasoning provided."}
                                          </p>
                                        </>
                                      ) : (
                                        <p className="text-xs text-slate-400">
                                          No analysis recorded for this message.
                                        </p>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </Card>

            <Card className="bg-slate-900/50 border-slate-700 p-6">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                Exchange History ({exchangeHistory.length})
              </h3>

              {exchangeHistory.length === 0 ? (
                <p className="text-slate-500 text-sm">No scored exchanges recorded.</p>
              ) : (
                <div className="space-y-3">
                  {exchangeHistory.map((ex, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-800 border border-slate-700 rounded-xl p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-slate-400 uppercase">
                          Exchange {idx + 1}
                        </span>
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
                            ? `${forDebater?.username} won`
                            : `${againstDebater?.username} won`}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                          <p className="text-xs text-green-400 font-semibold mb-1">
                            FOR — {forDebater?.username}
                          </p>
                          <p className="text-xl font-bold text-white">
                            +{ex.forUser.points.toFixed(1)}
                          </p>
                        </div>
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                          <p className="text-xs text-blue-400 font-semibold mb-1">
                            AGAINST — {againstDebater?.username}
                          </p>
                          <p className="text-xl font-bold text-white">
                            +{ex.againstUser.points.toFixed(1)}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{ex.reasoning}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebateResultPage;