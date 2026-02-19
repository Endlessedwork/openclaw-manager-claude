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

// Model Fallbacks
export const getFallbacks = () => api.get('/models/fallbacks');
export const updateFallbacks = (data) => api.put('/models/fallbacks', data);
export const updateAgentFallbacks = (id, data) => api.put(`/models/fallbacks/agent/${id}`, data);

// Channels (read-only)
export const getChannels = () => api.get('/channels');

// Sessions (read-only)
export const getSessions = (limit = 50) => api.get(`/sessions?limit=${limit}`);

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

// Hooks/Webhooks
export const getHooksConfig = () => api.get('/hooks/config');
export const getHookMappings = () => api.get('/hooks/mappings');

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

export default api;
