// src/pages/DashboardPage.tsx
import React, { useState, useEffect, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Eye, Swords, LogOut, Users, Loader2, Copy, LogIn, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Debate, Topic, User, Challenge } from "@/types";


import {
  getDebates,
  getTopics,
  createChallenge,
  joinDebate,
  getDebateById,
} from "@/api/debateAPI";
import { useSocket } from "../contexts/SocketContext";

const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // --- State ---
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]); // "Created Debates"
  
  // Create Modal State
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState<boolean>(false);
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [selectedPosition, setSelectedPosition] = useState<"for" | "against">("for");
  
  // Join By ID State (NEW)
  const [joinId, setJoinId] = useState("");
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);

  const [liveDebates, setLiveDebates] = useState<Debate[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchLive = async () => {
      const all = await getDebates(); // unfiltered fetch — visible to any logged-in user
      setLiveDebates(
        all.filter((d) => {
          const isLiveOrOpen = d.status === "pending" || d.status === "live";
          // The creator (and anyone already seated as debater1/debater2) already
          // has this debate under "Your Active Debates" — don't also surface it
          // here as something to discover/join, and definitely don't let the
          // creator "watch" their own debate from this list.
          const isOwnDebate = d.debater1.id === user.id || d.debater2?.id === user.id;
          return isLiveOrOpen && !isOwnDebate;
        })
      );
    };
    fetchLive();
    const interval = setInterval(fetchLive, 5000); // poll for new/joined debates
    return () => clearInterval(interval);
  }, [user]);

  // Entering a room from this discovery list is ALWAYS as audience. Becoming
  // a debater (filling debater2) requires knowing the exact debate ID that
  // the creator shared out-of-band — see handleJoinById below. There is no
  // one-click "join as opponent" from browsing anymore.
  const handleWatch = (debateId: string) => navigate(`/debate/${debateId}`);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [topicsData] = await Promise.all([getTopics()]);
        setTopics(topicsData);
        // In a real app, we would fetch existing challenges here too
      } catch (error) {
        toast.error("Error", { description: "Failed to load dashboard data." });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, navigate]);

  const handleLogout = (): void => {
    logout();
    navigate("/login");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.info("ID copied to clipboard!");
  };

  // --- 1. Create Challenge Logic ---
  const handleCreateChallenge = async () => {
    if (!selectedTopic || !user) {
      toast.warning("Missing Information", { description: "Please select a topic." });
      return;
    }

    try {
      const newChallenge = await createChallenge(user, selectedTopic, selectedPosition);
      
      // Add to local state to show immediately
      setChallenges((prev) => [...prev, newChallenge]);
      
      setIsCreateDialogOpen(false);
      setSelectedTopic("");
      toast.success("Debate Created! Share the ID below.");
    } catch (error) {
      console.error("Error creating challenge:", error);
      toast.error("Failed to create challenge");
    }
  };

  // --- 2. Join by ID Logic (NEW) ---
  const handleJoinById = async () => {
    if (!user || !joinId.trim()) return;
    try {
      // First fetch the debate to inspect its current state
      const debate = await getDebateById(joinId.trim());
      if (!debate) {
        toast.error("Debate not found", { description: "Check the ID and try again." });
        return;
      }

      // If user is already a participant (reconnecting), skip the join call
      const isDebater1 = user.id === debate.debater1.id;
      const isDebater2 = user.id === debate.debater2.id;
      if (isDebater1 || isDebater2) {
        toast.success("Rejoining debate...");
        setIsJoinDialogOpen(false);
        navigate(`/debate/${joinId.trim()}`);
        return;
      }

      // New participant — call the join endpoint
      const success = await joinDebate(joinId.trim(), user);
      if (success) {
        toast.success("Joined successfully! Entering room...");
        setIsJoinDialogOpen(false);
        navigate(`/debate/${joinId.trim()}`);
      } else {
        toast.error("Cannot join", { description: "Debate is full or no longer accepting players." });
      }
    } catch (error) {
      toast.error("Error joining debate");
    }
  };

  // --- 3. Enter Room Logic (For Creator) ---
  const handleEnterRoom = (debateId: string) => {
    navigate(`/debate/${debateId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-2 bg-slate-800 rounded-lg">
              <Swords className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Debate Proctor</h1>
              <p className="text-sm text-slate-400">Welcome, {user?.username}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* JOIN BY ID BUTTON (NEW) */}
            <Dialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="gap-2 bg-slate-800 hover:bg-slate-700 text-white">
                  <LogIn className="w-4 h-4" /> Join by ID
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-900 border-slate-700 text-white">
                <DialogHeader>
                  <DialogTitle>Enter Debate ID</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Debate Room ID</Label>
                    <Input 
                      placeholder="Paste ID here (e.g. 157e...)" 
                      className="bg-slate-800 border-slate-600"
                      value={joinId}
                      onChange={(e) => setJoinId(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleJoinById} className="w-full bg-red-600 hover:bg-red-700">
                    Join Room
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            

            <Button
              variant="secondary"
              onClick={() => navigate("/history")}
              className="gap-2 bg-slate-800 hover:bg-slate-700 text-white"
            >
              <History className="w-4 h-4" /> History
            </Button>

            <Button variant="ghost" onClick={handleLogout} className="text-slate-400 hover:text-white">
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          {/* Create Button */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-red-600 hover:bg-red-700 text-white">
                <Plus className="w-4 h-4 mr-2" /> Start New Debate
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700 text-white">
              <DialogHeader>
                <DialogTitle>Create New Challenge</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Select Topic</Label>
                  <select
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="w-full p-2 bg-slate-800 border border-slate-700 rounded-md text-white"
                  >
                    <option value="">Choose a topic...</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Your Position</Label>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant={selectedPosition === "for" ? "default" : "outline"}
                      onClick={() => setSelectedPosition("for")}
                      className={selectedPosition === "for" ? "bg-green-600" : "bg-transparent border-slate-600"}
                    >
                      For
                    </Button>
                    <Button
                      type="button"
                      variant={selectedPosition === "against" ? "default" : "outline"}
                      onClick={() => setSelectedPosition("against")}
                      className={selectedPosition === "against" ? "bg-red-600" : "bg-transparent border-slate-600"}
                    >
                      Against
                    </Button>
                  </div>
                </div>
                <Button onClick={handleCreateChallenge} className="w-full bg-slate-100 text-slate-900 hover:bg-white">
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
            <Eye className="w-6 h-6 mr-2 text-slate-400" /> Live & Open Debates
          </h2>

          {liveDebates.length === 0 ? (
            <Card className="p-8 bg-slate-900/50 border-slate-700 text-center">
              <p className="text-slate-400">No debates happening right now. Start one!</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {liveDebates.map((d) => {
                const isOpen = d.status === "pending" && !d.debater2?.id;

                return (
                  <Card key={d.id} className="p-6 bg-slate-900/50 border-slate-700 hover:border-slate-600 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{d.topic.title}</h3>
                        <p className="text-sm text-slate-400 mt-1">
                          {d.debater1.username} ({d.debater1.position})
                          {d.debater2?.id ? ` vs ${d.debater2.username} (${d.debater2.position})` : " — waiting for opponent"}
                        </p>
                      </div>
                      <Badge className={d.status === "live"
                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"}>
                        {d.status}
                      </Badge>
                    </div>

                    {/* Browsing this list only ever gets you in as audience. To
                        debate, you need the room's ID from whoever created it —
                        use "Join by ID" above. */}
                    <Button onClick={() => handleWatch(d.id)} size="sm" variant="outline" className="bg-slate-600 border-slate-600 text-slate-300 hover:bg-slate-800 w-full gap-2">
                      <Eye className="w-4 h-4" /> {isOpen ? "Watch (Waiting for Opponent)" : "Watch Live"}
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Created Debates List */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
            <Users className="w-6 h-6 mr-2 text-slate-400" /> Your Active Debates
          </h2>
          
          {challenges.length === 0 ? (
             <Card className="p-8 bg-slate-900/50 border-slate-700 text-center">
               <p className="text-slate-400">You haven't created any debates yet.</p>
             </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AnimatePresence>
                {challenges.map((challenge, index) => (
                  <motion.div
                    key={challenge.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="p-6 bg-slate-900/50 border-slate-700 hover:border-slate-600 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-white">{challenge.topic.title}</h3>
                          <Badge className="mt-2 bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                            {challenge.status}
                          </Badge>
                        </div>
                        <Button 
                          onClick={() => handleEnterRoom(challenge.id)}
                          size="sm"
                          variant="outline"
                          className="border-red-500 text-red-400 hover:bg-red-950"
                        >
                          Enter Room
                        </Button>
                      </div>

                      {/* ID Copy Section */}
                      <div className="p-3 bg-slate-950 rounded border border-dashed border-slate-700 flex items-center justify-between">
                        <code className="text-xs text-slate-400 font-mono truncate max-w-[200px]">
                          {challenge.id}
                        </code>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => copyToClipboard(challenge.id)}
                          className="h-6 w-6 text-slate-400 hover:text-white"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 text-center">
                        Share this ID with your opponent to start
                      </p>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;