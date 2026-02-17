import React, { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import MainLayout from "./layout/MainLayout";
import DashboardPage from "./pages/DashboardPage";
import AgentsPage from "./pages/AgentsPage";
import SkillsPage from "./pages/SkillsPage";
import ToolsPage from "./pages/ToolsPage";
import ModelsPage from "./pages/ModelsPage";
import ChannelsPage from "./pages/ChannelsPage";
import SessionsPage from "./pages/SessionsPage";
import CronPage from "./pages/CronPage";
import ConfigPage from "./pages/ConfigPage";
import GatewayPage from "./pages/GatewayPage";
import ClawHubPage from "./pages/ClawHubPage";
import HooksPage from "./pages/HooksPage";
import ActivitiesPage from "./pages/ActivitiesPage";
import LogsPage from "./pages/LogsPage";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/models" element={<ModelsPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/cron" element={<CronPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/gateway" element={<GatewayPage />} />
            <Route path="/activities" element={<ActivitiesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/clawhub" element={<ClawHubPage />} />
            <Route path="/hooks" element={<HooksPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}

export default App;
