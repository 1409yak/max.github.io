import { API_URL } from './config.js';

export async function postForm(params) {
  const body = new URLSearchParams(params);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  return res.json();
}

export async function getMessages() {
  const res = await fetch(`${API_URL}?mode=messages`);
  return res.json();
}
