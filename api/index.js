import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { Resend } from 'resend';
import { censorText } from './_lib/censorship.js';

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Resend для отправки писем
const resend = new Resend(process.env.RESEND_API_KEY);

const generateToken = (userId, nickname) => {
  return jwt.sign({ userId, nickname }, JWT_SECRET, { expiresIn: '30d' });
};

const getUserFromToken = async (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: user } = await supabase
      .from('users')
      .select('id, nickname, avatar_url')
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
  res.status(201).json({ token, user: { id: user.id, nickname: user.nickname, servers, avatar_url: null } });
});

app.post('/api/auth/login', async (req, res) => {
  const { nickname, password } = req.body;
  
  const { data: user, error } = await supabase
    .from('users')
    .select('id, nickname, password_hash, avatar_url')
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
  
  res.status(200).json({ token, user: { id: user.id, nickname: user.nickname, servers, avatar_url: user.avatar_url } });
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

// === Аватар ===
app.post('/api/auth/avatar', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { avatar_url } = req.body;
  if (!avatar_url) return res.status(400).json({ error: 'Avatar URL required' });
  
  const { error } = await supabase
    .from('users')
    .update({ avatar_url })
    .eq('id', user.id);
  
  if (error) return res.status(500).json({ error: 'Failed to update avatar' });
  res.json({ success: true, avatar_url });
});

// === Заказы артов (с отправкой на почту через Resend) ===
app.post('/api/orders', upload.single('image'), async (req, res) => {
  console.log('📥 Получен запрос на заказ');
  
  try {
    const { nickname, contacts, prompt } = req.body;
    const file = req.file;
    
    if (!nickname || !contacts || !prompt || !file) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    
    // Загружаем в Supabase Storage
    const fileName = `${Date.now()}_${file.originalname}`;
    const { data, error } = await supabase.storage
      .from('order_images')
      .upload(fileName, file.buffer, { contentType: file.mimetype });
    
    if (error) {
      console.error('❌ Ошибка загрузки в Storage:', error);
      return res.status(500).json({ error: 'Image upload failed: ' + error.message });
    }
    
    const imageUrl = supabase.storage.from('order_images').getPublicUrl(fileName).data.publicUrl;
    console.log('✅ Файл загружен:', imageUrl);
    
    // Сохраняем в БД
    const { error: dbError } = await supabase
      .from('orders')
      .insert({ nickname, contacts, prompt, image_url: imageUrl });
    
    if (dbError) {
      console.error('❌ Ошибка сохранения в БД:', dbError);
    }
    
    // Отправляем письмо через Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'alukardgame1@yandex.ru',
      subject: `🎨 Новый заказ арта от ${nickname}`,
      html: `
        <h2>🎨 Новый заказ арта/видео</h2>
        <p><strong>👤 Ник:</strong> ${nickname}</p>
        <p><strong>📞 Контакты:</strong> ${contacts}</p>
        <p><strong>📝 Промт:</strong><br/>${prompt}</p>
        <p><strong>🖼️ Скриншот:</strong><br/><a href="${imageUrl}">Открыть</a></p>
        <p><strong>📅 Дата:</strong> ${new Date().toLocaleString()}</p>
      `,
    });
    
    if (emailError) {
      console.error('❌ Ошибка Resend:', emailError);
    } else {
      console.log('✅ Письмо отправлено:', emailData);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Критическая ошибка:', err);
    res.status(500).json({ error: err.message });
  }
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
  
  const now = Date.now();
  if (userLastMessageTime[user.id] && now - userLastMessageTime[user.id] < 5000) {
    return res.status(429).json({ error: 'Слишком часто, подождите 5 секунд' });
  }
  userLastMessageTime[user.id] = now;
  
  let { server, chat, text } = req.body;
  if (!text?.trim()) {
    return res.status(400).json({ error: 'Message is empty' });
  }
  
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
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  let { server, item, price, contact } = req.body;
  if (!item || !price) return res.status(400).json({ error: 'Missing required fields' });
  
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
    approved: false,
    created_at: new Date().toISOString()
  };
  
  const { data, error } = await supabase.from('trades').insert(newTrade).select().single();
  if (error) return res.status(500).json({ error: 'Failed to create' });
  res.status(201).json(data);
});

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
  if (server && server !== 'Все') query = query.eq('server', server);
  
  const { data, error } = await query;
  if (error) return res.status(500).json([]);
  res.status(200).json(data || []);
});

app.delete('/api/trades/:id', async (req, res) => {
  const { id } = req.params;
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  
  const { data: trade } = await supabase.from('trades').select('user_id').eq('id', id).single();
  if (!trade || trade.user_id !== user.id) return res.status(403).json({ error: 'Not yours' });
  
  const { error } = await supabase.from('trades').delete().eq('id', id);
  if (error) return res.status(500).json({ error: 'Delete failed' });
  res.status(200).json({ success: true });
});

// === Заглушка для Google ===
app.post('/api/auth/google', async (req, res) => {
  const { nickname } = req.body;
  let { data: user } = await supabase.from('users').select('id, nickname').eq('nickname', nickname).single();
  if (!user) {
    const { data: newUser } = await supabase.from('users').insert({ nickname, password_hash: 'google_oauth' }).select().single();
    user = newUser;
  }
  const token = generateToken(user.id, user.nickname);
  res.status(200).json({ token, user: { ...user, servers: ['32'] } });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));