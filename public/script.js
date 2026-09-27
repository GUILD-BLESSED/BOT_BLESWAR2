const servidores = [
    "Sv 1", "Sv 2", "Sv 3", "Sv 4", "Sv 5", "Sv 6", "Sv 7", "Sv 8", 
    "Sv 10", "Sv 11", "Sv 12", "Sv 14", "Sv 15", "Sv 16", "Sv 17", "Sv 19", 
    "Speed 1", "Speed 2", "Speed 3"
];

let bossActualIndex = 0;
let datosGlobales = [];
let configBosses = [];
let audioContext = null;
let alertasDisparadas = {};

function activarAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    document.getElementById("btnAudio").innerText = "🔊 Alertas Sonoras Activas";
    document.getElementById("btnAudio").style.backgroundColor = "#16a34a";
    reproducirBeep(600, 200);
}

function reproducirBeep(frecuencia, duracion) {
    if (!audioContext) return;
    try {
        let osc = audioContext.createOscillator();
        let gain = audioContext.createGain();
        osc.type = "sine";
        osc.frequency.value = frecuencia;
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start();
        setTimeout(() => { osc.stop(); }, duracion);
    } catch (e) {
        console.log("Error reproduciendo audio", e);
    }
}

async function cargarDatosServidor() {
    try {
        const response = await fetch('/api/bosses');
        const data = await response.json();
        if (data.success) {
            datosGlobales = data.registros;
            configBosses = data.configBosses;
            
            if(data.user) {
                document.getElementById("userInfo").innerHTML = `Conectado como: <span>${data.user.username}</span> | Personaje: <span>${data.user.character_nick || 'N/A'}</span>`;
            }

            inicializarSelect();
            renderTabla();
        }
    } catch (e) {
        console.error("Error al obtener los datos:", e);
    }
}

function inicializarSelect() {
    const select = document.getElementById("bossSelect");
    if (!select || select.children.length > 0) return;
    select.innerHTML = "";
    configBosses.forEach((boss, index) => {
        let opt = document.createElement("option");
        opt.value = index;
        opt.text = `${boss.name} (${boss.intervalo}h)`;
        select.appendChild(opt);
    });
}

function cambiarBoss() {
    bossActualIndex = document.getElementById("bossSelect").value;
    renderTabla();
}

function renderTabla() {
    if (!configBosses.length) return;
    const boss = configBosses[bossActualIndex];
    document.getElementById("subInfo").innerText = `${boss.name.toUpperCase()} RESPAWN TRACKER | COOLDOWN ${boss.intervalo} HORAS`;

    const tbody = document.getElementById("tablaBody");
    tbody.innerHTML = "";

    servidores.forEach(sv => {
        let registro = datosGlobales.find(item => {
            let bossCoincide = item.boss.toLowerCase().includes(boss.name.toLowerCase());
            let svLimpio = item.servidor.toLowerCase().replace(/\s+/g, '');
            let svTarget = sv.toLowerCase().replace(/\s+/g, '');
            return bossCoincide && svLimpio === svTarget;
        });

        let fechaMuerte = registro ? registro.fecha : "Sin datos recientes";
        let cazador = registro ? registro.cazador : "-";
        let svKey = sv.replace(/\s+/g, '');

        let tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${sv}</strong></td>
            <td id="fecha-${svKey}">${fechaMuerte}</td>
            <td>${cazador}</td>
            <td id="respawn-${svKey}">--/-- --:--</td>
            <td id="tiempo-${svKey}">Calculando...</td>
        `;
        tbody.appendChild(tr);
    });

    actualizarContadores();
}

function actualizarContadores() {
    if (!configBosses.length) return;
    const boss = configBosses[bossActualIndex];
    const ahora = new Date();

    servidores.forEach(sv => {
        let svKey = sv.replace(/\s+/g, '');
        let fechaTd = document.getElementById(`fecha-${svKey}`);
        if (!fechaTd) return;
        let fechaTexto = fechaTd.innerText.trim();

        let respawnTd = document.getElementById(`respawn-${svKey}`);
        let tiempoTd = document.getElementById(`tiempo-${svKey}`);

        if (fechaTexto === "Sin datos recientes" || !fechaTexto) {
            if(respawnTd) respawnTd.innerText = "N/A";
            if(tiempoTd) {
                tiempoTd.innerText = "N/A";
                tiempoTd.className = "";
            }
            return;
        }

        let formatoLimpio = fechaTexto.replace(/-/g, '/');
        let fMuerte = new Date(formatoLimpio);

        if (isNaN(fMuerte.getTime())) {
            if(respawnTd) respawnTd.innerText = "Formato inválido";
            if(tiempoTd) tiempoTd.innerText = "Error";
            return;
        }

        let fRespawn = new Date(fMuerte.getTime() + (boss.intervalo * 3600000));
        let diferencia = fRespawn - ahora;

        respawnTd.innerText = fRespawn.toLocaleString('es-VE', { 
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });

        let idAlertaKey = `${boss.name}-${sv}`;

        if (diferencia <= 0) {
            let tiempoPasado = Math.abs(diferencia);
            let hPasadas = Math.floor(tiempoPasado / 3600000);
            let mPasadas = Math.floor((tiempoPasado % 3600000) / 60000);
            tiempoTd.innerHTML = `🟢 **¡VIVO!** (+${hPasadas}h ${mPasadas}m)`;
            tiempoTd.className = "status-vivo";
        } else {
            let minutosRestantes = diferencia / 60000;
            let hRestantes = Math.floor(diferencia / 3600000);
            let mRestantes = Math.floor((diferencia % 3600000) / 60000);
            let sRestantes = Math.floor((diferencia % 60000) / 1000);

            if (minutosRestantes > 4.5 && minutosRestantes <= 5.5) {
                tiempoTd.innerHTML = `⚠️ **¡5 MINUTOS!** (${mRestantes}m ${sRestantes}s)`;
                tiempoTd.className = "alerta-5";
                if (alertasDisparadas[idAlertaKey] !== '5m') {
                    reproducirBeep(880, 400);
                    alertasDisparadas[idAlertaKey] = '5m';
                }
            } else if (minutosRestantes > 9.5 && minutosRestantes <= 10.5) {
                tiempoTd.innerHTML = `🔔 **¡10 MINUTOS!** (${mRestantes}m ${sRestantes}s)`;
                tiempoTd.className = "alerta-10";
                if (alertasDisparadas[idAlertaKey] !== '10m') {
                    reproducirBeep(440, 300);
                    alertasDisparadas[idAlertaKey] = '10m';
                }
            } else {
                tiempoTd.innerHTML = `⏳ ${hRestantes}h ${mRestantes}m ${sRestantes}s`;
                tiempoTd.className = "status-tiempo";
            }
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    cargarDatosServidor();
    setInterval(actualizarContadores, 1000);
    setInterval(cargarDatosServidor, 120000);
});
