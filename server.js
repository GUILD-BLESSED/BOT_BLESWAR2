const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de la base de datos Turso
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'libsql://tu-base-de-datos.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN || 'tu-token'
});

// Inicializar tabla de usuarios
async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      nickname TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'pending'
    )
  `);
}
initDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'bleswar_secret_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Middlewares de autenticación y roles
function requiereLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect('/login.html');
}

function requiereAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).send('Acceso denegado');
}

// Cargar configuración de jefes
let configBosses = [];
try {
  const rawData = fs.readFileSync(path.join(__dirname, 'bosses.json'), 'utf8');
  configBosses = JSON.parse(rawData);
} catch (e) {
  console.error("Error al cargar bosses.json:", e.message);
}

// API de Jefes (Web scraping de MegaMu)
app.get('/api/bosses', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
    }
    try {
        const { data } = await axios.get("https://es.megamu.net/boss-log", {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            }
        });
        
        const $ = cheerio.load(data);
        let registros = [];

        $('table tr').each((i, row) => {
            const cols = $(row).find('td');
            if (cols.length >= 4) {
                const fecha = cols.eq(0).text().trim();
                const boss = cols.eq(1).text().trim();
                const cazador = cols.eq(2).text().trim();
                const servidor = cols.eq(3).text().trim();

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

// Rutas de autenticación
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.execute({
            sql: "SELECT * FROM users WHERE username = ? OR nickname = ?",
            args: [username, username]
        });
        if (result.rows.length === 0) return res.json({ success: false, error: 'Usuario no encontrado' });
        
        const user = result.rows[0];
        if (user.status !== 'active') return res.json({ success: false, error: 'Cuenta pendiente de aprobación' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.json({ success: false, error: 'Contraseña incorrecta' });

        req.session.user = { id: user.id, username: user.username, nickname: user.nickname, role: user.role };
        res.json({ success: true, role: user.role });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/register', async (req, res) => {
    const { username, nickname, password } = req.body;
    try {
        const hashed = await bcrypt.hash(password, 10);
        await db.execute({
            sql: "INSERT INTO users (username, nickname, password, role, status) VALUES (?, ?, ?, 'user', 'pending')",
            args: [username, nickname, hashed]
        });
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: 'El usuario o nick ya existe' });
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// API Panel Admin para gestionar usuarios
app.get('/api/admin/users', requiereAdmin, async (req, res) => {
    try {
        const result = await db.execute("SELECT id, username, nickname, role, status FROM users");
        res.json({ success: true, users: result.rows });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/admin/action', requiereAdmin, async (req, res) => {
    const { userId, action } = req.body;
    try {
        if (action === 'approve') {
            await db.execute({ sql: "UPDATE users SET status = 'active' WHERE id = ?", args: [userId] });
        } else if (action === 'ban') {
            await db.execute({ sql: "UPDATE users SET status = 'banned' WHERE id = ?", args: [userId] });
        } else if (action === 'make_admin') {
            await db.execute({ sql: "UPDATE users SET role = 'admin' WHERE id = ?", args: [userId] });
        } else if (action === 'make_user') {
            await db.execute({ sql: "UPDATE users SET role = 'user' WHERE id = ?", args: [userId] });
        }
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.get('/admin.html', requiereAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', requiereLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
