import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { GatewayBannerProvider } from "./contexts/GatewayBannerContext";
import ProtectedRoute from "./components/ProtectedRoute";
import MainLayout from "./layout/MainLayout";
import LoginPage from "./pages/LoginPage";
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
import UsersPage from "./pages/UsersPage";
import HealthPage from "./pages/HealthPage";
import FilesPage from "./pages/FilesPage";
import ProvidersPage from "./pages/ProvidersPage";
import UsagePage from "./pages/UsagePage";
import WorkspaceUsersPage from "./pages/WorkspaceUsersPage";
import WorkspaceGroupsPage from "./pages/WorkspaceGroupsPage";
import WorkspaceKBPage from "./pages/WorkspaceKBPage";
import WorkspaceDocsPage from "./pages/WorkspaceDocsPage";

function ThemedToaster() {
  const { isDark } = useTheme();
  return <Toaster position="bottom-right" theme={isDark ? 'dark' : 'light'} />;
}

function App() {
  return (
    <div className="App">
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute><GatewayBannerProvider><MainLayout /></GatewayBannerProvider></ProtectedRoute>}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/usage" element={<UsagePage />} />
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/skills" element={<SkillsPage />} />
                <Route path="/tools" element={<ToolsPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/providers" element={<ProvidersPage />} />
                <Route path="/channels" element={<ChannelsPage />} />
                <Route path="/sessions" element={<SessionsPage />} />
                <Route path="/cron" element={<CronPage />} />
                <Route path="/config" element={<ConfigPage />} />
                <Route path="/gateway" element={<GatewayPage />} />
                <Route path="/health" element={<HealthPage />} />
                <Route path="/files" element={<FilesPage />} />
                <Route path="/activities" element={<ActivitiesPage />} />
                <Route path="/logs" element={<LogsPage />} />
                <Route path="/clawhub" element={<ClawHubPage />} />
                <Route path="/hooks" element={<HooksPage />} />
                <Route path="/workspace/users" element={<WorkspaceUsersPage />} />
                <Route path="/workspace/groups" element={<WorkspaceGroupsPage />} />
                <Route path="/workspace/kb" element={<WorkspaceKBPage />} />
                <Route path="/workspace/docs" element={<WorkspaceDocsPage />} />
                <Route path="/users" element={<ProtectedRoute roles={["admin"]}><UsersPage /></ProtectedRoute>} />
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
        <ThemedToaster />
      </ThemeProvider>
    </div>
  );
}

export default App;
