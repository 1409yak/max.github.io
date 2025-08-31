import { postForm } from './api.js';
import { enterChat, leaveChat } from './ui.js';

// ===== AUTH STORAGE =====
export function saveAuth(u, p) { localStorage.setItem('gm_user', JSON.stringify({ u, p })); }
export function loadAuth() { try { return JSON.parse(localStorage.getItem('gm_user') || 'null'); } catch { return null; } }
export function clearAuth() { localStorage.removeItem('gm_user'); }

// ===== AUTH API =====
export async function register(username, password) {
  return postForm({ mode: 'register', username, password });
}

export async function login(username, password) {
  const resp = await postForm({ mode: 'login', username, password });
  if (resp.status === 'ok') {
    saveAuth(username, password);
    enterChat(username);
  }
  return resp;
}

export function logout() {
  clearAuth();
  leaveChat();
}
