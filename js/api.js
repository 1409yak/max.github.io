// api.js
import { API_URL } from './config.js'; // Import the API_URL from your config

export async function getMessages(username = null) {
  let url = `${API_URL}?mode=messages`;
  if (username) {
    url += `&user=${encodeURIComponent(username)}`;
  }
  
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return { status: 'error', message: 'Network error' };
  }
}

export async function postForm(data) {
  const formData = new URLSearchParams();
  for (const key in data) {
    formData.append(key, data[key]);
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to post form:', error);
    return { status: 'error', message: 'Network error' };
  }
}