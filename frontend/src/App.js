import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { GatewayBannerProvider } from "./contexts/GatewayBannerContext";
import { AppConfigProvider } from "./contexts/AppConfigContext";
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
import BindingsPage from "./pages/BindingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import GeneralSettingsPage from "./pages/GeneralSettingsPage";

function ThemedToaster() {
  const { isDark } = useTheme();
  return <Toaster position="bottom-right" theme={isDark ? 'dark' : 'light'} />;
}

function App() {
  return (
    <div className="App">
      <ThemeProvider>
        <BrowserRouter>
          <AppConfigProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute><GatewayBannerProvider><MainLayout /></GatewayBannerProvider></ProtectedRoute>}>
                <Route path="/dashboard" element={<DashboardPage />} />
                {/* All roles: Dashboard, Agents, Workspace */}
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/skills" element={<SkillsPage />} />
                <Route path="/tools" element={<ToolsPage />} />
                <Route path="/clawhub" element={<ClawHubPage />} />
                <Route path="/workspace/users" element={<WorkspaceUsersPage />} />
                <Route path="/workspace/groups" element={<WorkspaceGroupsPage />} />
                <Route path="/workspace/kb" element={<WorkspaceKBPage />} />
                <Route path="/workspace/docs" element={<WorkspaceDocsPage />} />
                {/* superadmin, admin, manager: Usage, Operations */}
                <Route path="/usage" element={<ProtectedRoute roles={["superadmin","admin","manager"]}><UsagePage /></ProtectedRoute>} />
                <Route path="/sessions" element={<ProtectedRoute roles={["superadmin","admin","manager"]}><SessionsPage /></ProtectedRoute>} />
                <Route path="/cron" element={<ProtectedRoute roles={["superadmin","admin","manager"]}><CronPage /></ProtectedRoute>} />
                {/* superadmin, admin: AI Models, Integrations, Monitoring, System */}
                <Route path="/models" element={<ProtectedRoute roles={["superadmin","admin"]}><ModelsPage /></ProtectedRoute>} />
                <Route path="/providers" element={<ProtectedRoute roles={["superadmin","admin"]}><ProvidersPage /></ProtectedRoute>} />
                <Route path="/channels" element={<ProtectedRoute roles={["superadmin","admin"]}><ChannelsPage /></ProtectedRoute>} />
                <Route path="/hooks" element={<ProtectedRoute roles={["superadmin","admin"]}><HooksPage /></ProtectedRoute>} />
                <Route path="/bindings" element={<ProtectedRoute roles={["superadmin","admin"]}><BindingsPage /></ProtectedRoute>} />
                <Route path="/activities" element={<ProtectedRoute roles={["superadmin","admin"]}><ActivitiesPage /></ProtectedRoute>} />
                <Route path="/logs" element={<ProtectedRoute roles={["superadmin","admin"]}><LogsPage /></ProtectedRoute>} />
                <Route path="/health" element={<ProtectedRoute roles={["superadmin","admin"]}><HealthPage /></ProtectedRoute>} />
                <Route path="/config" element={<ProtectedRoute roles={["superadmin","admin"]}><ConfigPage /></ProtectedRoute>} />
                <Route path="/gateway" element={<ProtectedRoute roles={["superadmin","admin"]}><GatewayPage /></ProtectedRoute>} />
                <Route path="/files" element={<ProtectedRoute roles={["superadmin","admin"]}><FilesPage /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute roles={["superadmin","admin"]}><NotificationsPage /></ProtectedRoute>} />
                <Route path="/settings/general" element={<ProtectedRoute roles={["superadmin","admin"]}><GeneralSettingsPage /></ProtectedRoute>} />
                {/* Superadmin only */}
                <Route path="/users" element={<ProtectedRoute roles={["superadmin"]}><UsersPage /></ProtectedRoute>} />
              </Route>
            </Routes>
          </AuthProvider>
          </AppConfigProvider>
        </BrowserRouter>
        <ThemedToaster />
      </ThemeProvider>
    </div>
  );
}

export default App;
