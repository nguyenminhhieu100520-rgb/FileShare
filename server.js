const { ExpressPeerServer } = require('peer');
const express = require('express');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const peerServer = ExpressPeerServer(server, {
    path: '/',
    allow_discovery: false,
});
app.use('/peerjs', peerServer);
peerServer.on('connection', (client) => {
    console.log(`🔗 Peer connected: ${client.getId()}`);
});
peerServer.on('disconnect', (client) => {
    console.log(`❌ Peer disconnected: ${client.getId()}`);
});
const rateLimitMap = new Map();

function rateLimit(req, res, next) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    const now = Date.now();    
    const WINDOW = 60 * 1000;  
    const MAX = 30;             

    let entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
        entry = { count: 1, resetAt: now + WINDOW };
    } else {
        entry.count++;
    }
    rateLimitMap.set(ip, entry);

    if (entry.count > MAX) {

        return res.status(429).json({ error: 'Too many requests. Vui lòng thử lại sau.' });
    }
    next();
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
}, 5 * 60 * 1000); 

app.use(express.static('public'));
app.get('/config', rateLimit, (req, res) => {
    const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.secure;
    res.json({
        peerHost: req.hostname,
        peerPort: isSecure ? 443 : PORT,
        peerPath: '/peerjs',
        secure: isSecure,
    });
});
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server sẵn sàng tại port ${PORT}`);
    console.log(`   PeerJS path : /peerjs`);
    console.log(`   Config API  : /config\n`);
});
