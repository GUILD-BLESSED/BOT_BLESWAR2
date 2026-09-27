const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { createClient } = require('@libsql/client');
const configBosses = require('./bosses.json');

const app = express();
const PORT = process.env.PORT || 3000;

const db = createClient({
    url: process.env.TURSO_DATABASE_URL || "file:database.sqlite",
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDB() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                nickname TEXT,
                password TEXT,
                status TEXT DEFAULT 'pending',
                role TEXT DEFAULT 'user'
            )
        `);
        console.log("📦 Base de datos conectada y sincronizada en Turso correctamente.");
    } catch (err) {
        console.error("Error inicializando la base de datos:", err);
    }
}
initDB();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'bleswar_secret_key_mega_mu',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function requiereLoginAPI(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: "No autenticado" });
    }
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

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, nickname, password } = req.body;
        if (!username || !nickname || !password) return res.redirect('/login.html?error=empty');

        const hashedPassword = await bcrypt.hash(password, 10);
        const countResult = await db.execute(`SELECT COUNT(*) as count FROM users`);
        const isFirst = countResult.rows[0].count === 0;
        const status = isFirst ? 'active' : 'pending';
        const role = isFirst ? 'admin' : 'user';

        await db.execute({
            sql: `INSERT INTO users (username, nickname, password, status, role) VALUES (?, ?, ?, ?, ?)`,
            args: [username, nickname, hashedPassword, status, role]
        });

        res.redirect('/login.html?registered=true');
    } catch (err) {
        res.redirect('/login.html?error=userexists');
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await db.execute({
            sql: `SELECT * FROM users WHERE username = ?`,
            args: [username]
        });

        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.redirect('/login.html?error=invalid');
        }
        if (user.status === 'banned') return res.redirect('/login.html?error=banned');
        if (user.status === 'pending') return res.redirect('/login.html?error=pending');

        req.session.user = { id: user.id, username: user.username, nickname: user.nickname, role: user.role, status: user.status };
        if (user.role === 'admin') res.redirect('/admin.html');
        else res.redirect('/');
    } catch (err) {
        res.redirect('/login.html?error=invalid');
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy(() => { res.redirect('/login.html'); });
});

app.get('/admin.html', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/login.html');
    }
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
        const result = await db.execute(`SELECT id, username, nickname, status, role FROM users`);
        res.json({ success: true, users: result.rows, currentUser: req.session.user.username });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/admin/update-status', requiereAdminAPI, async (req, res) => {
    try {
        const { userId, status } = req.body;
        await db.execute({
            sql: `UPDATE users SET status = ? WHERE id = ?`,
            args: [status, userId]
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/admin/update-role', requiereAdminAPI, async (req, res) => {
    try {
        const { userId, role } = req.body;
        await db.execute({
            sql: `UPDATE users SET role = ? WHERE id = ?`,
            args: [role, userId]
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/bosses', requiereLoginAPI, async (req, res) => {
    try {
        const { data } = await axios.get("https://es.megamu.net/boss-log", {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            }
        });
        
        const $ = cheerio.load(data);
        let registros = [];

        $('table tr, tbody tr, tr').each((i, row) => {
            const cols = $(row).find('td');
            if (cols.length >= 3) {
                const fecha = cols.eq(0).text().trim();
                const boss = cols.eq(1).text().trim();
                const cazador = cols.eq(2).text().trim();
                const servidor = cols.length >= 4 ? cols.eq(3).text().trim() : "Sv 1";

                if (fecha && boss && !fecha.toLowerCase().includes('fecha')) {
                    registros.push({ fecha, boss, cazador, servidor });
                }
            }
        });

        let formattedConfig = {};
        configBosses.forEach(b => {
            formattedConfig[b.name] = {
                respawnMinutes: Math.round(b.intervalo * 60),
                mapa: b.mapa
            };
        });

        res.json({ success: true, registros, configBosses: formattedConfig, user: req.session.user });
    } catch (error) {
        console.error("Error al extraer boss-log:", error.message);
        res.status(500).json({ success: false, error: "No se pudo conectar con MegaMu", registros: [], configBosses: {} });
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor BLESWAR seguro corriendo en el puerto ${PORT}`);
});
