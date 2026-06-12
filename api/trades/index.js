import { censorText } from '../../client/src/utils/censorship.js';

export default async function handler(req, res) {
  // GET /api/trades
  if (req.method === 'GET') {
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
  }
  
  // POST /api/trades
  if (req.method === 'POST') {
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
    return res.status(201).json(data);
  }
  
  // DELETE /api/trades/:id
  if (req.method === 'DELETE') {
    const { id } = req.query;
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
    
    return res.status(200).json({ success: true });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}