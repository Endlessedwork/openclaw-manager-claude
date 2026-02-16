import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

// Dashboard
export const getDashboard = () => api.get('/dashboard');

// Agents
export const getAgents = () => api.get('/agents');
export const getAgent = (id) => api.get(`/agents/${id}`);
export const createAgent = (data) => api.post('/agents', data);
export const updateAgent = (id, data) => api.put(`/agents/${id}`, data);
export const deleteAgent = (id) => api.delete(`/agents/${id}`);

// Skills
export const getSkills = () => api.get('/skills');
export const getSkill = (id) => api.get(`/skills/${id}`);
export const createSkill = (data) => api.post('/skills', data);
export const updateSkill = (id, data) => api.put(`/skills/${id}`, data);
export const deleteSkill = (id) => api.delete(`/skills/${id}`);

// Tools
export const getTools = () => api.get('/tools');
export const createTool = (data) => api.post('/tools', data);
export const updateTool = (id, data) => api.put(`/tools/${id}`, data);
export const deleteTool = (id) => api.delete(`/tools/${id}`);

// Models
export const getModels = () => api.get('/models');
export const createModel = (data) => api.post('/models', data);
export const updateModel = (id, data) => api.put(`/models/${id}`, data);
export const deleteModel = (id) => api.delete(`/models/${id}`);

// Channels
export const getChannels = () => api.get('/channels');
export const createChannel = (data) => api.post('/channels', data);
export const updateChannel = (id, data) => api.put(`/channels/${id}`, data);
export const deleteChannel = (id) => api.delete(`/channels/${id}`);

// Sessions
export const getSessions = (limit = 50) => api.get(`/sessions?limit=${limit}`);
export const deleteSession = (id) => api.delete(`/sessions/${id}`);

// Cron
export const getCronJobs = () => api.get('/cron');
export const createCronJob = (data) => api.post('/cron', data);
export const updateCronJob = (id, data) => api.put(`/cron/${id}`, data);
export const deleteCronJob = (id) => api.delete(`/cron/${id}`);

// Config
export const getConfig = () => api.get('/config');
export const updateConfig = (data) => api.put('/config', data);

// Gateway
export const getGatewayStatus = () => api.get('/gateway/status');
export const restartGateway = () => api.post('/gateway/restart');

// Logs
export const getLogs = (limit = 50) => api.get(`/logs?limit=${limit}`);

// Seed
export const seedData = () => api.post('/seed');

// ClawHub Marketplace
export const getClawHubSkills = (search = '', category = 'all') => api.get(`/clawhub?search=${search}&category=${category}`);
export const installClawHubSkill = (id) => api.post(`/clawhub/install/${id}`);
export const uninstallClawHubSkill = (id) => api.post(`/clawhub/uninstall/${id}`);
export const seedClawHub = () => api.post('/clawhub/seed');

// Hooks/Webhooks
export const getHooksConfig = () => api.get('/hooks/config');
export const updateHooksConfig = (data) => api.put('/hooks/config', data);
export const getHookMappings = () => api.get('/hooks/mappings');
export const createHookMapping = (data) => api.post('/hooks/mappings', data);
export const updateHookMapping = (id, data) => api.put(`/hooks/mappings/${id}`, data);
export const deleteHookMapping = (id) => api.delete(`/hooks/mappings/${id}`);

// Session Messages
export const getSessionMessages = (sessionId) => api.get(`/sessions/${sessionId}/messages`);

// Config Validation
export const validateConfig = (data) => api.post('/config/validate', data);

export default api;
