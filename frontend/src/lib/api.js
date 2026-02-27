import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Dashboard
export const getDashboard = () => api.get('/dashboard');

// Agents
export const getAgents = () => api.get('/agents');
export const getAgent = (id) => api.get(`/agents/${id}`);
export const updateAgentMd = (id, data) => api.put(`/agents/${id}/md`, data);

// Skills (read-only)
export const getSkills = () => api.get('/skills');
export const getSkill = (id) => api.get(`/skills/${id}`);

// Tools (read-only)
export const getTools = () => api.get('/tools');

// Models (read-only from CLI)
export const getModels = () => api.get('/models');

// Model Providers (CRUD via config)
export const getProviders = () => api.get('/models/providers');
export const createProvider = (data) => api.post('/models/providers', data);
export const updateProvider = (id, data) => api.put(`/models/providers/${id}`, data);
export const deleteProvider = (id) => api.delete(`/models/providers/${id}`);
export const testProviderConnection = (id) => api.post(`/models/providers/${id}/test`);
export const fetchProviderModels = (id, data) => api.post(`/models/providers/${id}/fetch-models`, data);

// Model Fallbacks
export const getFallbacks = () => api.get('/models/fallbacks');
export const updateFallbacks = (data) => api.put('/models/fallbacks', data);
export const updateAgentFallbacks = (id, data) => api.put(`/models/fallbacks/agent/${id}`, data);

// Channels
export const getChannels = () => api.get('/channels');
export const updateChannel = (id, data) => api.put(`/channels/${id}`, data);

// Sessions (read-only)
export const getSessions = (limit = 50) => api.get(`/sessions?limit=${limit}`);
export const getSessionConversations = (sessionKey) =>
  api.get(`/conversations/by-session-key?session_key=${encodeURIComponent(sessionKey)}`);

// Usage analytics
export const getUsageCost = (params = {}) => {
  const q = new URLSearchParams();
  if (params.start && params.end) {
    q.set('start', params.start);
    q.set('end', params.end);
  } else {
    q.set('days', String(params.days || 30));
  }
  return api.get(`/usage/cost?${q.toString()}`);
};

export const getUsageBreakdown = (params = {}) => {
  const q = new URLSearchParams();
  if (params.start && params.end) {
    q.set('start', params.start);
    q.set('end', params.end);
  } else {
    q.set('days', String(params.days || 30));
  }
  return api.get(`/usage/breakdown?${q.toString()}`);
};

// Cron (read-only)
export const getCronJobs = () => api.get('/cron');

// Config
export const getConfig = () => api.get('/config');
export const updateConfig = (data) => api.put('/config', data);

// Gateway
export const getGatewayStatus = () => api.get('/gateway/status');
export const restartGateway = () => api.post('/gateway/restart');

// Logs
export const getLogs = (limit = 50) => api.get(`/logs?limit=${limit}`);

// ClawHub Marketplace
export const getClawHubSkills = (search = '', category = 'all') => api.get(`/clawhub?search=${search}&category=${category}`);
export const installClawHubSkill = (id, envVars = {}) => api.post(`/clawhub/install/${id}`, { env_vars: envVars });
export const uninstallClawHubSkill = (id) => api.post(`/clawhub/uninstall/${id}`);

// System Health
export const getSystemHealth = () => api.get('/health/system');

// Files
export const getFileCategories = () => api.get('/files/categories');
export const getFileTree = (path) => api.get(`/files/tree?path=${encodeURIComponent(path)}`);
export const getFileContent = (path) => api.get(`/files/content?path=${encodeURIComponent(path)}`);
export const updateFileContent = (path, content) => api.put(`/files/content?path=${encodeURIComponent(path)}`, { content });
export const getFileRaw = (path) => api.get(`/files/raw?path=${encodeURIComponent(path)}`, { responseType: 'blob' });

// Hooks/Webhooks
export const getHooksConfig = () => api.get('/hooks/config');
export const getHookMappings = () => api.get('/hooks/mappings');

// Bindings (agent-group routing)
export const getBindings = () => api.get('/bindings');
export const getBindingOptions = () => api.get('/bindings/options');
export const createBinding = (data) => api.post('/bindings', data);
export const updateBinding = (id, data) => api.put(`/bindings/${id}`, data);
export const deleteBinding = (id) => api.delete(`/bindings/${id}`);

// Notifications
export const getNotificationRules = () => api.get('/notifications/rules');
export const getNotificationEventTypes = () => api.get('/notifications/event-types');
export const getNotificationGroups = () => api.get('/notifications/groups');
export const createNotificationRule = (data) => api.post('/notifications/rules', data);
export const updateNotificationRule = (id, data) => api.put(`/notifications/rules/${id}`, data);
export const deleteNotificationRule = (id) => api.delete(`/notifications/rules/${id}`);
export const testNotification = (data) => api.post('/notifications/test', data);

// Config Validation
export const validateConfig = (data) => api.post('/config/validate', data);

// Agent Activities
export const getActivities = (params = {}) => {
  const q = new URLSearchParams();
  if (params.agent_id) q.set('agent_id', params.agent_id);
  if (params.event_type) q.set('event_type', params.event_type);
  if (params.status) q.set('status', params.status);
  if (params.limit) q.set('limit', params.limit);
  if (params.since_id) q.set('since_id', params.since_id);
  return api.get(`/activities?${q.toString()}`);
};
export const getActivitiesStats = () => api.get('/activities/stats');
export const getActivityDetail = (id) => api.get(`/activities/${id}`);

// System Logs
export const getSystemLogs = (params = {}) => {
  const q = new URLSearchParams();
  if (params.level) q.set('level', params.level);
  if (params.source) q.set('source', params.source);
  if (params.search) q.set('search', params.search);
  if (params.limit) q.set('limit', String(params.limit || 200));
  if (params.since_id) q.set('since_id', params.since_id);
  return api.get(`/system-logs?${q.toString()}`);
};
export const getSystemLogsStats = () => api.get('/system-logs/stats');

// WebSocket URL helper
export const getWsUrl = (path, token) => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = BACKEND_URL ? new URL(BACKEND_URL).host : window.location.host;
  const tokenParam = token ? `?token=${token}` : '';
  return `${proto}//${host}/api/ws/${path}${tokenParam}`;
};

// Auth
export const loginUser = (data) => api.post('/auth/login', data, { withCredentials: true });
export const refreshToken = () => api.post('/auth/refresh', {}, { withCredentials: true });
export const logoutUser = () => api.post('/auth/logout', {}, { withCredentials: true });
export const getMe = () => api.get('/auth/me');

// Users (Admin)
export const getUsers = () => api.get('/users');
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);

// Workspace
export const getWorkspaceUsers = () => api.get('/workspace/users');
export const patchWorkspaceUser = (filename, data) => api.patch(`/workspace/users/${filename}`, data);
export const getWorkspaceGroups = () => api.get('/workspace/groups');
export const patchWorkspaceGroup = (filename, data) => api.patch(`/workspace/groups/${filename}`, data);
export const getWorkspaceKnowledge = () => api.get('/workspace/knowledge');
export const getWorkspaceKnowledgeContent = (path) => api.get(`/workspace/knowledge/content?path=${encodeURIComponent(path)}`);
export const getWorkspaceDocuments = () => api.get('/workspace/documents');

export default api;
