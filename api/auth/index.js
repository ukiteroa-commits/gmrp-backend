import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
app.use(cors());
app.use(express.json());

// === Supabase ===
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// === Вспомогательные функции ===
const generateToken = (userId, nickname) => {
  return jwt.sign({ userId, nickname }, JWT_SECRET, { expiresIn: '30d' });
};

const getUserFromToken = async (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: user } = await supabase
      .from('users')
      .select('id, nickname')
      .eq('id', decoded.userId)
      .single();
    return user;
  } catch {
    return null;
  }
};

// === Тестовые эндпоинты ===
app.get('/api/ping', (req, res) => res.json({ ping: true, time: Date.now() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// === Авторизация ===
app.post('/api/auth/register', async (req, res) => {
  const { nickname, password, servers } = req.body;
  if (!nickname || !password || password.length < 4 || !servers?.length) {
    return res.status(400).json({ error: 'Invalid registration data' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const { data: user, error } = await supabase
    .from('users')
    .insert({ nickname, password_hash: passwordHash })
    .select()
    .single();
  if (error) return res.status(400).json({ error: 'Nickname already exists' });
  
  // Добавляем сервера
  await supabase.from('user_servers').insert(servers.map(s => ({ user_id: user.id, server_id: s })));
  const token = generateToken(user.id, user.nickname);
  res.status(201).json({ token, user: { ...user, servers } });
});

app.post('/api/auth/login', async (req, res) => {
  const { nickname, password } = req.body;
  const { data: user, error } = await supabase
    .from('users')
    .select('id, nickname, password_hash')
    .eq('nickname', nickname)
    .single();
  if (error || !user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const { data: serversData } = await supabase.from('user_servers').select('server_id').eq('user_id', user.id);
  const servers = serversData?.map(s => s.server_id) || [];
  const token = generateToken(user.id, user.nickname);
  res.status(200).json({ token, user: { ...user, servers } });
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ user: null });
  const { data: serversData } = await supabase.from('user_servers').select('server_id').eq('user_id', user.id);
  res.status(200).json({ user: { ...user, servers: serversData?.map(s => s.server_id) || [] } });
});

// === Чаты ===
app.get('/api/messages', async (req, res) => {
  const { server, chat } = req.query;
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('server', server)
    .eq('chat', chat)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return res.status(500).json([]);
  res.json(data || []);
});

app.post('/api/messages', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { server, chat, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Message is empty' });
  
  const { data, error } = await supabase
    .from('messages')
    .insert({ server, chat, user_id: user.id, nickname: user.nickname, text: text.trim() })
    .select()
    .single();
  if (error) return res.status(500).json({ error: 'Failed to send' });
  res.status(201).json(data);
});

// === Запуск ===
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));