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
echo app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); >> api\index.jsecho import { Router } from 'express'; > api\auth\index.js
echo import register from './register.js'; >> api\auth\index.js
echo import login from './login.js'; >> api\auth\index.js
echo import me from './me.js'; >> api\auth\index.js
echo import updateServers from './updateServers.js'; >> api\auth\index.js
echo. >> api\auth\index.js
echo const router = Router(); >> api\auth\index.js
echo router.post('/register', register); >> api\auth\index.js
echo router.post('/login', login); >> api\auth\index.js
echo router.get('/me', me); >> api\auth\index.js
echo router.post('/updateServers', updateServers); >> api\auth\index.js
echo export default router; >> api\auth\index.js