const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const configBosses = require('./bosses.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de la Base de Datos SQLite local
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error("Error abriendo la base de datos", err.message);
    else console.log("📦 Base de datos conectada correctamente.");
});

// Crear tablas de usuarios si no existen (El primer usuario registrado será administrador automáticamente)
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        status TEXT DEFAULT 'pending', -- 'pending', 'active', 'banned'
        role TEXT DEFAULT 'user'       -- 'user', 'admin'
    )`);
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'bleswar_secret_key_mega_mu',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 horas
}));

// Middleware para verificar autenticación y estado
function requiereLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/login.html');
    if (req.session.user.status === 'banned') return res.redirect('/login.html?error=banned');
    if (req.session.user.status === 'pending') return res.redirect('/login.html?error=pending');
    next();
}

// Middleware para verificar Admin
function requiereAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: "Acceso denegado" });
    }
    next();
}

// Rutas de Autenticación
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.redirect('/login.html?error=empty');

    const hashedPassword = await bcrypt.hash(password, 10);

    // Verificar si es el primer usuario para hacerlo Admin automáticamente y activarlo de una vez
    db.get(`SELECT COUNT(*) as count FROM users`, async (err, row) => {
        const isFirst = row.count === 0;
        const status = isFirst ? 'active' : 'pending';
        const role = isFirst ? 'admin' : 'user';

        db.run(`INSERT INTO users (username, password, status, role) VALUES (?, ?, ?, ?)`, 
            [username, hashedPassword, status, role], (err) => {
            if (err) return res.redirect('/login.html?error=userexists');
            res.redirect('/login.html?registered=true');
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.redirect('/login.html?error=invalid');
        }
        if (user.status === 'banned') return res.redirect('/login.html?error=banned');
        if (user.status === 'pending') return res.redirect('/login.html?error=pending');

        req.session.user = { id: user.id, username: user.username, role: user.role, status: user.status };
        if (user.role === 'admin') res.redirect('/admin.html');
        else res.redirect('/');
    });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy(() => { res.redirect('/login.html'); });
});

// Rutas de administración de usuarios (Solo Admin)
app.get('/api/admin/users', requiereAdmin, (req, res) => {
    db.all(`SELECT id, username, status, role FROM users`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, users: rows, currentUser: req.session.user.username });
    });
});

app.post('/api/admin/update-status', requiereAdmin, (req, res) => {
    const { userId, status } = req.body;
    db.run(`UPDATE users SET status = ? WHERE id = ? AND role != 'admin'`, [status, userId], function(err) {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

// Servir la página web protegida
app.use(requiereLogin, express.static(path.join(__dirname, 'public')));

// Ruta de Web Scraping de Bosses (Protegida)
app.get('/api/bosses', requiereLogin, async (req, res) => {
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
        res.status(500).json({ success: false, error: "No se pudo conectar con MegaMu" });
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor BLESWAR seguro corriendo en el puerto ${PORT}`);
});
