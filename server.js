const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const configBosses = require('./bosses.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos (HTML, CSS, JS del cliente)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta API para que la web consulte los datos frescos de los jefes
app.api = app.get('/api/bosses', async (req, res) => {
    try {
        const { data } = await axios.get("https://es.megamu.net/boss-log");
        const $ = cheerio.load(data);
        let registros = [];

        $('.table tbody tr').each((i, row) => {
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

        res.json({ success: true, registros, configBosses });
    } catch (error) {
        console.error("Error haciendo scraping en MegaMu:", error.message);
        res.status(500).json({ success: false, error: "No se pudo conectar con MegaMu" });
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor BLESWAR corriendo en el puerto ${PORT}`);
});
