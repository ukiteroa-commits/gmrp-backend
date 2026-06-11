import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Простой тестовый эндпоинт
app.get('/api/ping', (req, res) => {
  res.json({ ping: true, time: Date.now() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Регистрация (временная, без сохранения в БД для теста)
app.post('/api/auth/register', async (req, res) => {
  const { nickname, password, servers } = req.body;
  
  if (!nickname || !password || password.length < 4 || !servers?.length) {
    return res.status(400).json({ error: 'Invalid registration data' });
  }
  
  // Временный ответ — позже подключим БД
  res.status(201).json({
    token: 'test-token',
    user: { id: Date.now(), nickname, servers }
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});