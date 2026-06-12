import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { censorText } from '../client/src/utils/censorship.js';

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
app.post('/api/auth/test-register', (req, res) => {
  console.log('✅ ТЕСТОВЫЙ ЗАПРОС ПОЛУЧЕН!', req.body);
  res.status(200).json({ message: 'Тестовый эндпоинт работает', body: req.body });
});

// === Авторизация ===
app.post('/api/auth/register', async (req, res) => {
  const { nickname, password, servers } = req.body;
  
  if (!nickname || !password || password.length < 6 || !servers?.length) {
    return res.status(400).json({ error: 'Invalid registration data' });
  }
  
  if (servers.length > 5) {
    return res.status(400).json({ error: 'Max 5 servers' });
  }
  
  const passwordHash = await bcrypt.hash(password, 10);
  
  const { data: user, error } = await supabase
    .from('users')
    .insert({ nickname, password_hash: passwordHash })
    .select()
    .single();
  
  if (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Nickname already exists' });
    }
    return res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
  
  const serverRows = servers.map(s => ({ user_id: user.id, server_id: s }));
  await supabase.from('user_servers').insert(serverRows);
  
  const token = generateToken(user.id, user.nickname);
  res.status(201).json({ token, user: { id: user.id, nickname: user.nickname, servers } });
});

app.post('/api/auth/login', async (req, res) => {
  const { nickname, password } = req.body;
  
  const { data: user, error } = await supabase
    .from('users')
    .select('id, nickname, password_hash')
    .eq('nickname', nickname)
    .single();
  
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const { data: serversData } = await supabase
    .from('user_servers')
    .select('server_id')
    .eq('user_id', user.id);
  
  const servers = serversData?.map(s => s.server_id) || [];
  const token = generateToken(user.id, user.nickname);
  
  res.status(200).json({ token, user: { id: user.id, nickname: user.nickname, servers } });
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await getUserFromToken(token);
  
  if (!user) {
    return res.status(401).json({ user: null });
  }
  
  const { data: serversData } = await supabase
    .from('user_servers')
    .select('server_id')
    .eq('user_id', user.id);
  
  const servers = serversData?.map(s => s.server_id) || [];
  res.status(200).json({ user: { ...user, servers } });
});

app.post('/api/auth/updateServers', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await getUserFromToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { servers } = req.body;
  if (!servers || !Array.isArray(servers) || servers.length === 0 || servers.length > 5) {
    return res.status(400).json({ error: 'Invalid servers list' });
  }
  
  await supabase.from('user_servers').delete().eq('user_id', user.id);
  const serverRows = servers.map(s => ({ user_id: user.id, server_id: s }));
  await supabase.from('user_servers').insert(serverRows);
  
  res.status(200).json({ success: true, servers });
});

// === Чаты с фильтрацией ===
const messages = [];
const userLastMessageTime = {};

app.get('/api/messages', (req, res) => {
  const { server, chat } = req.query;
  const filtered = messages.filter(m => m.server === server && m.chat === chat);
  res.json(filtered.slice(-100));
});

app.post('/api/messages', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await getUserFromToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Антифлуд
  const now = Date.now();
  if (userLastMessageTime[user.id] && now - userLastMessageTime[user.id] < 5000) {
    return res.status(429).json({ error: 'Слишком часто, подождите 5 секунд' });
  }
  userLastMessageTime[user.id] = now;
  
  let { server, chat, text } = req.body;
  if (!text?.trim()) {
    return res.status(400).json({ error: 'Message is empty' });
  }
  
  // Фильтрация текста
  text = censorText(text);
  if (text.replace(/[\s\*\[\]]/g, '').length === 0) {
    return res.status(400).json({ error: 'Message contains prohibited content' });
  }
  
  const newMsg = {
    id: Date.now(),
    server,
    chat,
    user_id: user.id,
    nickname: user.nickname,
    text,
    created_at: new Date().toISOString()
  };
  
  messages.push(newMsg);
  res.status(201).json(newMsg);
});

// === Торг (создание объявления с фильтрацией) ===
app.post('/api/trades', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await getUserFromToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  let { server, item, price, contact } = req.body;
  
  if (!item || !price) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Фильтрация
  item = censorText(item);
  if (item.length === 0 || item.length > 100) {
    return res.status(400).json({ error: 'Invalid item name (1-100 chars)' });
  }
  
  if (contact) contact = censorText(contact);
  
  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number' });
  }
  
  const newTrade = {
    user_id: user.id,
    nickname: user.nickname,
    server: server || '32',
    item,
    price: parseInt(price),
    contact: contact || '',
    approved: false, // требует модерации
    created_at: new Date().toISOString()
  };
  
  const { data, error } = await supabase
    .from('trades')
    .insert(newTrade)
    .select()
    .single();
  
  if (error) return res.status(500).json({ error: 'Failed to create' });
  res.status(201).json(data);
});

// === Получение объявлений (только одобренные) ===
app.get('/api/trades', async (req, res) => {
  const { mine, server } = req.query;
  
  let query = supabase.from('trades').select('*').order('created_at', { ascending: false });
  
  if (mine === '1') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await getUserFromToken(token);
    if (!user) return res.status(200).json([]);
    query = query.eq('user_id', user.id);
  } else {
    query = query.eq('approved', true);
  }
  
  if (server && server !== 'Все') {
    query = query.eq('server', server);
  }
  
  const { data, error } = await query;
  if (error) return res.status(500).json([]);
  return res.status(200).json(data || []);
});

// === Удаление объявления (только своих) ===
app.delete('/api/trades/:id', async (req, res) => {
  const { id } = req.params;
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await getUserFromToken(token);
  
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { data: trade } = await supabase
    .from('trades')
    .select('user_id')
    .eq('id', id)
    .single();
  
  if (!trade || trade.user_id !== user.id) {
    return res.status(403).json({ error: 'Not yours' });
  }
  
  const { error } = await supabase.from('trades').delete().eq('id', id);
  if (error) return res.status(500).json({ error: 'Delete failed' });
  
  res.status(200).json({ success: true });
});

// === Заглушка для Google ===
app.post('/api/auth/google', async (req, res) => {
  const { email, nickname, supabaseId } = req.body;
  
  let { data: user } = await supabase
    .from('users')
    .select('id, nickname')
    .eq('nickname', nickname)
    .single();
  
  if (!user) {
    const { data: newUser } = await supabase
      .from('users')
      .insert({ nickname, password_hash: 'google_oauth' })
      .select()
      .single();
    user = newUser;
  }
  
  const token = generateToken(user.id, user.nickname);
  res.status(200).json({ token, user: { ...user, servers: ['32'] } });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));