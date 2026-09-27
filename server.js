require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const configBosses = require('./bosses.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Configuración de la Base de Datos en Turso
const db = createClient({
    url: process.env.TURSO_DATABASE_URL || '',
    authToken: process.env.TURSO_AUTH_TOKEN || '',
});

async function initDB() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                character_nick TEXT,
                status TEXT DEFAULT 'pending',
                role TEXT DEFAULT 'user'
            )
        `);

        // Tabla de chat en tiempo real con límite de historial automático
        await db.execute(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                character_nick TEXT,
                message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const columnasAñadir = [
            'character_nick TEXT',
            'status TEXT DEFAULT "pending"',
            'role TEXT DEFAULT "user"'
        ];

        for (const col of columnasAñadir) {
            try {
                await db.execute(`ALTER TABLE users ADD COLUMN ${col}`);
            } catch (err) {}
        }

        console.log("☁️ Base de datos Turso conectada y esquemas actualizados con éxito.");
    } catch (e) {
        console.error("❌ Error inicializando Turso:", e.message);
    }
}
initDB();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
    secret: 'bleswar_secret_key_mega_mu',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
});

app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

function requiereLoginAPI(req, res, next) {
    if (!req.session.user) return res.status(401).json({ success: false, error: "No autenticado" });
    if (req.session.user.status === 'banned' || req.session.user.status === 'pending') {
        return res.status(403).json({ success: false, error: "Acceso no autorizado" });
    }
    next();
}

function requiereAdminAPI(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: "Acceso denegado" });
    }
    next();
}

app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/api/register', async (req, res) => {
    const { username, password, character_nick } = req.body;
    if (!username || !password || !character_nick) {
        return res.redirect('/login.html?error=empty');
    }

    try {
        const uClean = username.trim();
        const pClean = password.trim();
        const nickClean = character_nick.trim();

        const checkUser = await db.execute({
            sql: "SELECT username FROM users WHERE username = ?",
            args: [uClean]
        });
        
        if (checkUser.rows && checkUser.rows.length > 0) {
            return res.redirect('/login.html?error=userexists');
        }

        const countRes = await db.execute("SELECT COUNT(*) as count FROM users");
        let totalUsers = 0;
        if (countRes.rows && countRes.rows.length > 0) {
            const firstRow = countRes.rows[0];
            totalUsers = Number(firstRow.count ?? firstRow[0] ?? 0);
        }

        const isFirst = totalUsers === 0;
        const status = isFirst ? 'active' : 'pending';
        const role = isFirst ? 'admin' : 'user';

        const hashedPassword = await bcrypt.hash(pClean, 10);

        await db.execute({
            sql: "INSERT INTO users (username, password, character_nick, status, role) VALUES (?, ?, ?, ?, ?)",
            args: [uClean, hashedPassword, nickClean, status, role]
        });
        
        res.redirect('/login.html?registered=true');
    } catch (error) {
        console.error("❌ Error en registro:", error);
        res.redirect('/login.html?error=error');
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.redirect('/login.html?error=invalid');

    try {
        const uClean = username.trim();
        const result = await db.execute({ 
            sql: "SELECT * FROM users WHERE username = ?", 
            args: [uClean] 
        });

        if (!result.rows || result.rows.length === 0) {
            return res.redirect('/login.html?error=invalid');
        }

        const user = result.rows[0];
        const dbPassword = user.password;
        const dbStatus = user.status || 'pending';
        const dbRole = user.role || 'user';
        const dbId = user.id;
        const dbUsername = user.username;
        const dbNick = user.character_nick || '';

        const passwordMatch = await bcrypt.compare(password.trim(), dbPassword);
        if (!passwordMatch) {
            return res.redirect('/login.html?error=invalid');
        }

        if (dbStatus === 'banned') return res.redirect('/login.html?error=banned');
        if (dbStatus === 'pending') return res.redirect('/login.html?error=pending');

        req.session.user = { 
            id: dbId, 
            username: dbUsername, 
            character_nick: dbNick, 
            role: dbRole, 
            status: dbStatus 
        };

        if (dbRole === 'admin') res.redirect('/admin.html');
        else res.redirect('/');
    } catch (e) {
        console.error("❌ Error en login:", e);
        res.redirect('/login.html?error=error');
    }
});

app.get('/api/logout', (req, res) => req.session.destroy(() => res.redirect('/login.html')));

app.get('/admin.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login.html');
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/login.html');
    if (req.session.user.status === 'banned' || req.session.user.status === 'pending') {
        return res.redirect('/login.html?error=' + req.session.user.status);
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/admin/users', requiereAdminAPI, async (req, res) => {
    try {
        const result = await db.execute("SELECT id, username, character_nick, status, role FROM users");
        res.json({ success: true, users: result.rows, currentUser: req.session.user.username });
    } catch (e) {
        console.error("❌ Error cargando usuarios en admin:", e);
        res.status(500).json({ success: false });
    }
});

app.post('/api/admin/update-status', requiereAdminAPI, async (req, res) => {
    const { userId, status, role } = req.body;
    try {
        await db.execute({
            sql: "UPDATE users SET status = ?, role = ? WHERE id = ?",
            args: [status, role, userId]
        });
        res.json({ success: true });
    } catch (e) {
        console.error("❌ Error actualizando status:", e);
        res.status(500).json({ success: false });
    }
});

app.get('/api/bosses', requiereLoginAPI, async (req, res) => {
    try {
        const { data } = await axios.get("https://es.megamu.net/boss-log", {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const $ = cheerio.load(data);
        let registros = [];
        $('table tr, tbody tr').each((i, row) => {
            const cols = $(row).find('td');
            if (cols.length >= 4) {
                const fechaLimpia = cols.eq(0).text().trim(); 
                
                let fechaISO = fechaLimpia;
                if (fechaLimpia && fechaLimpia.includes('-') && !fechaLimpia.includes('+') && !fechaLimpia.endsWith('Z')) {
                    fechaISO = fechaLimpia.replace(' ', 'T') + '-03:00';
                }

                registros.push({
                    fecha: fechaLimpia,  
                    fechaISO: fechaISO,  
                    boss: cols.eq(1).text().trim(),
                    cazador: cols.eq(2).text().trim(),
                    servidor: cols.eq(3).text().trim()
                });
            }
        });
        res.json({ success: true, registros, configBosses, user: req.session.user });
    } catch (error) {
        console.error("❌ Error conectando con MegaMu:", error);
        res.status(500).json({ success: false, error: "Error conectando con MegaMu" });
    }
});

// -------------------------------------------------------------------------
// SOCKET.IO: CHAT EN TIEMPO REAL (MANTIENE ÚNICAMENTE LOS ÚLTIMOS 100 MENSAJES)
// -------------------------------------------------------------------------
io.on('connection', async (socket) => {
    const session = socket.request.session;
    if (!session || !session.user) return;

    try {
        const history = await db.execute("SELECT username, character_nick, message, timestamp FROM chat_messages ORDER BY id DESC LIMIT 100");
        socket.emit('chat_history', history.rows.reverse());
    } catch (e) {
        console.error("❌ Error cargando historial de chat:", e);
    }

    socket.on('send_message', async (text) => {
        if (!text || typeof text !== 'string' || text.trim() === '') return;
        
        const cleanMsg = text.trim().substring(0, 500);
        const user = session.user;

        try {
            await db.execute({
                sql: "INSERT INTO chat_messages (username, character_nick, message) VALUES (?, ?, ?)",
                args: [user.username, user.character_nick || user.username, cleanMsg]
            });

            // Limpieza automática para conservar solo los últimos 100 mensajes
            await db.execute(`
                DELETE FROM chat_messages 
                WHERE id NOT IN (
                    SELECT id FROM chat_messages ORDER BY id DESC LIMIT 100
                )
            `);

            const newMessage = {
                username: user.username,
                character_nick: user.character_nick || user.username,
                message: cleanMsg,
                timestamp: new Date().toISOString()
            };
            
            io.emit('new_message', newMessage);

        } catch (e) {
            console.error("❌ Error guardando mensaje en el chat:", e);
        }
    });
});

server.listen(PORT, () => console.log(`🌐 Servidor BLESWAR corriendo en el puerto ${PORT}`));
