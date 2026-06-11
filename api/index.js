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
  } catch (err) {
    console.error('❌ Ошибка getUserFromToken:', err);
    return null;
  }
};

// === ТЕСТОВЫЙ ЭНДПОИНТ (для диагностики) ===
app.post('/api/auth/test-register', (req, res) => {
  console.log('✅ ТЕСТОВЫЙ ЗАПРОС ПОЛУЧЕН!', req.body);
  res.status(200).json({ message: 'Тестовый эндпоинт работает', body: req.body });
});

// === Тестовые эндпоинты ===
app.get('/api/ping', (req, res) => res.json({ ping: true, time: Date.now() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// === Регистрация (с подробным логированием) ===
app.post('/api/auth/register', async (req, res) => {
  console.log('📥 Получен запрос на регистрацию:', req.body);
  
  try {
    const { nickname, password, servers } = req.body;
    
    // Валидация
    if (!nickname || !password || password.length < 4 || !servers?.length) {
      console.log('❌ Ошибка валидации');
      return res.status(400).json({ error: 'Invalid registration data' });
    }
    
    if (servers.length > 5) {
      console.log('❌ Слишком много серверов');
      return res.status(400).json({ error: 'Max 5 servers' });
    }
    
    console.log('🔐 Хешируем пароль...');
    const passwordHash = await bcrypt.hash(password, 10);
    console.log('✅ Пароль захеширован');
    
    console.log('💾 Сохраняем пользователя в Supabase...');
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({ nickname, password_hash: passwordHash })
      .select()
      .single();
    
    if (userError) {
      console.error('❌ Ошибка Supabase при создании пользователя:', userError);
      if (userError.code === '23505') {
        return res.status(400).json({ error: 'Nickname already exists' });
      }
      return res.status(500).json({ error: 'Registration failed: ' + userError.message });
    }
    
    console.log('✅ Пользователь создан:', user);
    
    // Добавляем сервера
    console.log('💾 Сохраняем сервера...');
    const serverRows = servers.map(s => ({ user_id: user.id, server_id: s }));
    const { error: serversError } = await supabase.from('user_servers').insert(serverRows);
    
    if (serversError) {
      console.error('❌ Ошибка при сохранении серверов:', serversError);
      // Не возвращаем ошибку, сервера можно добавить позже
    }
    
    const token = generateToken(user.id, user.nickname);
    console.log('✅ Токен создан, регистрация успешна');
    
    res.status(201).json({ 
      token, 
      user: { id: user.id, nickname: user.nickname, servers } 
    });
  } catch (err) {
    console.error('❌ Критическая ошибка в регистрации:', err);
    res.status(500).json({ error: err.message });
  }
});

// === Вход ===
app.post('/api/auth/login', async (req, res) => {
  console.log('📥 Получен запрос на вход:', req.body);
  
  try {
    const { nickname, password } = req.body;
    
    if (!nickname || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }
    
    const { data: user, error } = await supabase
      .from('users')
      .select('id, nickname, password_hash')
      .eq('nickname', nickname)
      .single();
    
    if (error || !user) {
      console.error('❌ Пользователь не найден:', error);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      console.error('❌ Неверный пароль');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const { data: serversData } = await supabase
      .from('user_servers')
      .select('server_id')
      .eq('user_id', user.id);
    
    const servers = serversData?.map(s => s.server_id) || [];
    const token = generateToken(user.id, user.nickname);
    
    console.log('✅ Вход успешен');
    res.status(200).json({ token, user: { id: user.id, nickname: user.nickname, servers } });
  } catch (err) {
    console.error('❌ Критическая ошибка при входе:', err);
    res.status(500).json({ error: err.message });
  }
});

// === Получить текущего пользователя ===
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

// === Обновление серверов ===
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

// === Чаты (временное хранилище) ===
const messages = [];

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
  
  const { server, chat, text } = req.body;
  if (!text?.trim()) {
    return res.status(400).json({ error: 'Message is empty' });
  }
  
  const newMsg = {
    id: Date.now(),
    server,
    chat,
    user_id: user.id,
    nickname: user.nickname,
    text: text.trim(),
    created_at: new Date().toISOString()
  };
  
  messages.push(newMsg);
  res.status(201).json(newMsg);
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

// === Запуск ===
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));