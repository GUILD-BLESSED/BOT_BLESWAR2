require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const configBosses = require('./bosses.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de la Base de Datos en Turso
const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
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
        console.log("☁️ Base de datos Turso conectada y tabla verificada.");
    } catch (e) {
        console.error("Error conectando a Turso:", e.message);
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
    if (!username || !password || !character_nick) return res.redirect('/login.html?error=empty');

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const countRes = await db.execute("SELECT COUNT(*) as count FROM users");
        const isFirst = countRes.rows[0].count === 0;
        
        const status = isFirst ? 'active' : 'pending';
        const role = isFirst ? 'admin' : 'user';

        await db.execute({
            sql: "INSERT INTO users (username, password, character_nick, status, role) VALUES (?, ?, ?, ?, ?)",
            args: [username, hashedPassword, character_nick, status, role]
        });
        res.redirect('/login.html?registered=true');
    } catch (error) {
        res.redirect('/login.html?error=userexists');
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.execute({ sql: "SELECT * FROM users WHERE username = ?", args: [username] });
        const user = result.rows[0];

        if (!user || !(await bcrypt.compare(password, user.password))) return res.redirect('/login.html?error=invalid');
        if (user.status === 'banned') return res.redirect('/login.html?error=banned');
        if (user.status === 'pending') return res.redirect('/login.html?error=pending');

        req.session.user = { id: user.id, username: user.username, character_nick: user.character_nick, role: user.role, status: user.status };
        if (user.role === 'admin') res.redirect('/admin.html');
        else res.redirect('/');
    } catch (e) {
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
                registros.push({
                    fecha: cols.eq(0).text().trim(),
                    boss: cols.eq(1).text().trim(),
                    cazador: cols.eq(2).text().trim(),
                    servidor: cols.eq(3).text().trim()
                });
            }
        });
        res.json({ success: true, registros, configBosses, user: req.session.user });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error conectando con MegaMu" });
    }
});

app.listen(PORT, () => console.log(`🌐 Servidor BLESWAR seguro corriendo en el puerto ${PORT}`));
