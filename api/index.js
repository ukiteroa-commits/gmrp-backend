echo import express from 'express'; > api\index.js
echo import authRoutes from './auth/index.js'; >> api\index.js
echo import messagesRoutes from './messages/index.js'; >> api\index.js
echo import tradesRoutes from './trades/index.js'; >> api\index.js
echo import eventsRoutes from './events/index.js'; >> api\index.js
echo. >> api\index.js
echo const app = express(); >> api\index.js
echo app.use(express.json()); >> api\index.js
echo. >> api\index.js
echo app.use('/api/auth', authRoutes); >> api\index.js
echo app.use('/api/messages', messagesRoutes); >> api\index.js
echo app.use('/api/trades', tradesRoutes); >> api\index.js
echo app.use('/api/events', eventsRoutes); >> api\index.js
echo. >> api\index.js
echo app.get('/api/health', (req, res) => res.json({ status: 'ok' })); >> api\index.js
echo app.get('/api/ping', (req, res) => res.json({ ping: true })); >> api\index.js
echo. >> api\index.js
echo const PORT = process.env.PORT || 3001; >> api\index.js
echo app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); >> api\index.js