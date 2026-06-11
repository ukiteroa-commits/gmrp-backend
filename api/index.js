import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();

// Разрешаем запросы с любых доменов (для Netlify, localhost и т.д.)
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ===== ТЕСТОВЫЕ ЭНДПОИНТЫ =====
app.get('/api/ping', (req, res) => {
  res.json({ ping: true, time: Date.now() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== АВТОРИЗАЦИЯ =====
// Регистрация
app.post('/api/auth/register', async (req, res) => {
  const { nickname, password, servers } = req.body;
  
  if (!nickname || !password || password.length < 4 || !servers?.length) {
    return res.status(400).json({ error: 'Invalid registration data' });
  }
  
  if (servers.length > 5) {
    return res.status(400).json({ error: 'Max 5 servers' });
  }
  
  // TODO: сохранить в Supabase
  res.status(201).json({
    token: 'test-token-' + Date.now(),
    user: { id: Date.now(), nickname, servers }
  });
});

// Вход
app.post('/api/auth/login', async (req, res) => {
  const { nickname, password } = req.body;
  
  if (!nickname || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }
  
  // TODO: проверить в Supabase
  res.status(200).json({
    token: 'test-token-' + Date.now(),
    user: { id: Date.now(), nickname, servers: ['32'] }
  });
});

// Получить текущего пользователя
app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ user: null });
  }
  
  // TODO: проверить токен
  res.status(200).json({
    user: { id: 1, nickname: 'TestUser', servers: ['32'] }
  });
});

// ===== ЧАТЫ =====
// Временное хранилище сообщений (в памяти)
const messages = [];

app.get('/api/messages', (req, res) => {
  const { server, chat } = req.query;
  const filtered = messages.filter(m => m.server === server && m.chat === chat);
  res.json(filtered.slice(-100));
});

app.post('/api/messages', async (req, res) => {
  const { server, chat, text } = req.body;
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!text?.trim()) {
    return res.status(400).json({ error: 'Message is empty' });
  }
  
  const newMsg = {
    id: Date.now(),
    server,
    chat,
    nickname: 'TestUser',
    user_id: 1,
    text: text.trim(),
    created_at: new Date().toISOString()
  };
  
  messages.push(newMsg);
  res.status(201).json(newMsg);
});

// ===== ЗАПУСК СЕРВЕРА =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});