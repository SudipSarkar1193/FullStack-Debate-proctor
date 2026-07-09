import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Trophy, Clock, Loader2, Users } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../contexts/AuthContext";
import { getDebates } from "@/api/debateAPI";
import type { Debate } from "@/types";

type ResultTone = "win" | "loss" | "tie" | "n/a";

const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [debates, setDebates] = useState<Debate[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<"mine" | "all">("mine");

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const load = async () => {
      setIsLoading(true);
      const params =
        filter === "mine" ? { userId: user.id, status: "completed" } : { status: "completed" };
      const data = await getDebates(params);
      setDebates(data);
      setIsLoading(false);
    };

    load();
  }, [filter, user, navigate]);

  const getResult = (debate: Debate): { label: string; tone: ResultTone } => {
    if (!user || !debate.scores) return { label: "—", tone: "n/a" };

    const isDebater1 = debate.debater1.id === user.id;
    const isDebater2 = debate.debater2?.id === user.id;
    if (!isDebater1 && !isDebater2) return { label: "Watched", tone: "n/a" };

    const myScore = isDebater1 ? debate.scores.debater1 : debate.scores.debater2;
    const otherScore = isDebater1 ? debate.scores.debater2 : debate.scores.debater1;

    if (myScore === otherScore) return { label: "Tie", tone: "tie" };
    return myScore > otherScore ? { label: "Won", tone: "win" } : { label: "Lost", tone: "loss" };
  };

  const toneClasses: Record<ResultTone, string> = {
    win: "bg-green-500/10 text-green-400 border-green-500/20",
    loss: "bg-red-500/10 text-red-400 border-red-500/20",
    tie: "bg-slate-500/10 text-slate-300 border-slate-500/20",
    "n/a": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };

  return (
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
          <h1 className="text-lg font-bold text-white">Debate History</h1>
          <div className="w-[168px]" />
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex space-x-2 mb-6">
          <Button
            onClick={() => setFilter("mine")}
            className={
              filter === "mine"
                ? "bg-slate-700 hover:bg-slate-600 text-white"
                : "bg-transparent hover:bg-slate-800 text-slate-400"
            }
          >
            My Debates
          </Button>
          <Button
            onClick={() => setFilter("all")}
            className={
              filter === "all"
                ? "bg-slate-700 hover:bg-slate-600 text-white"
                : "bg-transparent hover:bg-slate-800 text-slate-400"
            }
          >
            All Completed Debates
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        ) : debates.length === 0 ? (
          <Card className="p-10 bg-slate-900/50 border-slate-700 text-center">
            <p className="text-slate-400">No completed debates yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {debates.map((debate) => {
              const result = getResult(debate);
              return (
                <motion.div
                  key={debate.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card
                    className="p-5 bg-slate-900/50 border-slate-700 hover:border-slate-500 transition cursor-pointer"
                    onClick={() => navigate(`/history/${debate.id}`)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold mb-1 truncate">
                          {debate.topic.title}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {debate.debater1.username} vs {debate.debater2?.username || "—"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(debate.completedAt || debate.startedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Badge className={toneClasses[result.tone]}>
                        {result.tone === "win" && <Trophy className="w-3 h-3 mr-1" />}
                        {result.label}
                      </Badge>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryPage;