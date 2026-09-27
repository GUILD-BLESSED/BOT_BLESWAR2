// Lista de servidores estándar en MegaMu
const servidores = ["Sv 1", "Sv 2", "Sv 3", "Sv 4", "Sv 5", "Sv 6", "Sv 7", "Sv 8", "Sv 14", "Sv 15", "Sv 16"];
let bossActualIndex = 0;
let datosMegaMu = [];

// Cargar opciones en el selector de Bosses
function inicializarSelect() {
    const select = document.getElementById("bossSelect");
    if (!select) return;
    select.innerHTML = "";
    configBosses.forEach((boss, index) => {
        let opt = document.createElement("option");
        opt.value = index;
        opt.text = `${boss.name} (${boss.intervalo}h)`;
        select.appendChild(opt);
    });
}

function cambiarBoss() {
    const select = document.getElementById("bossSelect");
    if (select) {
        bossActualIndex = select.value;
        renderTabla();
    }
}

// Función para hacer Web Scraping mediante un Proxy CORS público
async function obtenerLogMegaMu() {
    try {
        const targetUrl = "https://es.megamu.net/boss-log";
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        if (!data.contents) return [];

        // Parsear el HTML recibido usando DOMParser del navegador
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.contents, 'text/html');
        
        let registros = [];
        doc.querySelectorAll('.table tbody tr').forEach(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length >= 4) {
                registros.push({
                    fecha: cols[0].textContent.trim(),
                    boss: cols[1].textContent.trim(),
                    cazador: cols[2].textContent.trim(),
                    servidor: cols[3].textContent.trim()
                });
            }
        });
        return registros;
    } catch (e) {
        console.error("Error al obtener el log de MegaMu:", e);
        return [];
    }
}

async function renderTabla() {
    const boss = configBosses[bossActualIndex];
    const subInfo = document.getElementById("subInfo");
    if (subInfo) {
        subInfo.innerText = `${boss.name.toUpperCase()} RESPAWN TRACKER | COOLDOWN ${boss.intervalo} HORAS`;
    }

    const tbody = document.getElementById("tablaBody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">🔄 Sincronizando con MegaMu...</td></tr>`;

    // Obtenemos los datos frescos de la web de MegaMu
    datosMegaMu = await obtenerLogMegaMu();
    tbody.innerHTML = "";

    servidores.forEach(sv => {
        // Buscar el registro más reciente para este Boss en este servidor específico
        let registroEncontrado = datosMegaMu.find(item => 
            item.boss.toLowerCase().includes(boss.name.toLowerCase()) && 
            item.servidor.toLowerCase() === sv.toLowerCase()
        );

        let fechaMuerte = registroEncontrado ? registroEncontrado.fecha : "Sin datos";
        let cazador = registroEncontrado ? registroEncontrado.cazador : "-";

        let tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${sv}</strong></td>
            <td id="fecha-${sv}">${fechaMuerte}</td>
            <td id="cazador-${sv}">${cazador}</td>
            <td id="respawn-${sv}">--/-- --:--</td>
            <td id="tiempo-${sv}">Calculando...</td>
            <td><button class="btn-action" onclick="forzarActualizacion()">Actualizar</button></td>
        `;
        tbody.appendChild(tr);
    });

    actualizarContadores();
}

function forzarActualizacion() {
    renderTabla();
}

function actualizarContadores() {
    if (!configBosses || configBosses.length === 0) return;
    const boss = configBosses[bossActualIndex];
    const ahora = new Date();

    servidores.forEach(sv => {
        let fechaTd = document.getElementById(`fecha-${sv}`);
        if (!fechaTd) return;
        let fechaTexto = fechaTd.innerText.trim();

        let respawnTd = document.getElementById(`respawn-${sv}`);
        let tiempoTd = document.getElementById(`tiempo-${sv}`);

        if (fechaTexto === "Sin datos" || !fechaTexto) {
            if(respawnTd) respawnTd.innerText = "N/A";
            if(tiempoTd) {
                tiempoTd.innerText = "Sin registros";
                tiempoTd.className = "";
            }
            return;
        }

        // Limpiar formato de fecha para que JavaScript lo procese (ej: "2026-09-26 21:00:00")
        let formatoLimpio = fechaTexto.replace(/-/g, '/');
        let fMuerte = new Date(formatoLimpio);

        if (isNaN(fMuerte.getTime())) {
            if(respawnTd) respawnTd.innerText = "Formato inválido";
            if(tiempoTd) tiempoTd.innerText = "Error";
            return;
        }

        // Calcular la fecha exacta de Respawn sumando las horas del intervalo
        let fRespawn = new Date(fMuerte.getTime() + (boss.intervalo * 3600000));
        let diferencia = fRespawn - ahora;

        if(respawnTd) {
            respawnTd.innerText = fRespawn.toLocaleString('es-VE', { 
                month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' 
            });
        }

        if (tiempoTd) {
            if (diferencia <= 0) {
                let tiempoPasado = Math.abs(diferencia);
                let hPasadas = Math.floor(tiempoPasado / 3600000);
                let mPasadas = Math.floor((tiempoPasado % 3600000) / 60000);
                tiempoTd.innerHTML = `🟢 **¡VIVO!** (+${hPasadas}h ${mPasadas}m)`;
                tiempoTd.className = "status-vivo";
            } else {
                let hRestantes = Math.floor(diferencia / 3600000);
                let mRestantes = Math.floor((diferencia % 3600000) / 60000);
                let sRestantes = Math.floor((diferencia % 60000) / 1000);
                tiempoTd.innerHTML = `⏳ ${hRestantes}h ${mRestantes}m ${sRestantes}s`;
                tiempoTd.className = "status-tiempo";
            }
        }
    });
}

// Inicializar la aplicación al cargar la página
document.addEventListener("DOMContentLoaded", () => {
    inicializarSelect();
    renderTabla();
    // Actualizar contadores cada segundo
    setInterval(actualizarContadores, 1000);
    // Volver a hacer web scraping a MegaMu automáticamente cada 2 minutos para mantener datos frescos
    setInterval(renderTabla, 120000);
});
        
