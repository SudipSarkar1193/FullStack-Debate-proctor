import "./App.css";
import React from "react";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import DebatePage from "./pages/DebatePage";
import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

const App: React.FC = () => {
  return (
    <div className="h-screen w-screen bg-gray-700">
      <Toaster richColors />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/debate/:debateId" element={<DebatePage />} />
      </Routes>
    </div>
  );
};

export default App;