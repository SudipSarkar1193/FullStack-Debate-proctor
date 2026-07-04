import React, { useState, type FormEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogIn, Users, Radio } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { useAuth } from "../contexts/AuthContext";
import { loginUser } from "@/api/debateAPI";
import { toast } from "sonner";
// import type { User } from "@/types";

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  // const [role, setRole] = useState<"debater" | "audience">("debater");

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const user = await loginUser(username, password);

    if (user) {
      login(user);
      toast.success("Login Successful", {
        description: `Welcome back, ${username}!`,
      });
      navigate("/dashboard");
    } else {
      toast.error("Login Failed", {
        description: "Invalid credentials or role mismatch",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="p-8 bg-slate-900/50 border-slate-700 backdrop-blur-sm">
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="inline-block p-4 bg-slate-800 rounded-full mb-4"
            >
              <Radio className="w-8 h-8 text-slate-300" />
            </motion.div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Debate Proctor
            </h1>
            <p className="text-slate-400">Enter the arena of ideas</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-300">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setUsername(e.target.value)
                }
                placeholder="Enter your username"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
                placeholder="Enter your password"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                required
              />
            </div>

            

            <Button
              type="submit"
              className="w-full bg-slate-700 hover:bg-slate-600 text-white"
            >
              Login
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
};

export default LoginPage;