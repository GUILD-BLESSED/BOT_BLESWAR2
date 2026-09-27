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
    } catch (e) { console.log(e); }
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
            return item.boss.toLowerCase().includes(boss.name.toLowerCase()) && 
                   item.servidor.toLowerCase().replace(/\s+/g, '') === sv.toLowerCase().replace(/\s+/g, '');
        });

        let tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${sv}</strong></td>
            <td id="fecha-${sv.replace(/\s+/g, '')}">${registro ? registro.fecha : "Sin datos"}</td>
            <td>${registro ? registro.cazador : "-"}</td>
            <td id="respawn-${sv.replace(/\s+/g, '')}">--/-- --:--</td>
            <td id="tiempo-${sv.replace(/\s+/g, '')}">Calculando...</td>
        `;
        tbody.appendChild(tr);
    });

    actualizarContadores();
}

function actualizarContadores() {
    if (!configBosses.length) return;
    const ahora = new Date();
    let top10Lista = [];

    // 1. Actualizar tabla principal del boss seleccionado
    const bossActual = configBosses[bossActualIndex];
    servidores.forEach(sv => {
        let svKey = sv.replace(/\s+/g, '');
        let fechaTd = document.getElementById(`fecha-${svKey}`);
        if (!fechaTd) return;
        let fechaTexto = fechaTd.innerText.trim();
        let respawnTd = document.getElementById(`respawn-${svKey}`);
        let tiempoTd = document.getElementById(`tiempo-${svKey}`);

        if (fechaTexto === "Sin datos") {
            if(respawnTd) respawnTd.innerText = "N/A";
            if(tiempoTd) { tiempoTd.innerText = "N/A"; tiempoTd.className = ""; }
            return;
        }

        let fMuerte = new Date(fechaTexto.replace(/-/g, '/'));
        if (isNaN(fMuerte.getTime())) return;

        let fRespawn = new Date(fMuerte.getTime() + (bossActual.intervalo * 3600000));
        let diferencia = fRespawn - ahora;

        respawnTd.innerText = fRespawn.toLocaleString('es-VE', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

        if (diferencia <= 0) {
            // Boss Vivo: Calcular cuánto tiempo lleva vivo
            let tVivo = Math.abs(diferencia);
            let hV = Math.floor(tVivo / 3600000);
            let mV = Math.floor((tVivo % 3600000) / 60000);
            let sV = Math.floor((tVivo % 60000) / 1000);
            
            tiempoTd.innerHTML = `🟢 **¡VIVO!** (Hace ${hV}h ${mV}m ${sV}s)`;
            tiempoTd.className = "status-vivo";
        } else {
            let mRestantes = Math.floor((diferencia % 3600000) / 60000);
            let sRestantes = Math.floor((diferencia % 60000) / 1000);
            let hRestantes = Math.floor(diferencia / 3600000);
            let idAlerta = `${bossActual.name}-${sv}`;

            if ((diferencia / 60000) > 4.5 && (diferencia / 60000) <= 5.5) {
                tiempoTd.innerHTML = `⚠️ **¡5 MINUTOS!** (${mRestantes}m ${sRestantes}s)`;
                tiempoTd.className = "alerta-5";
                if(alertasDisparadas[idAlerta] !== '5m') { reproducirBeep(880, 400); alertasDisparadas[idAlerta] = '5m'; }
            } else if ((diferencia / 60000) > 9.5 && (diferencia / 60000) <= 10.5) {
                tiempoTd.innerHTML = `🔔 **¡10 MINUTOS!** (${mRestantes}m ${sRestantes}s)`;
                tiempoTd.className = "alerta-10";
                if(alertasDisparadas[idAlerta] !== '10m') { reproducirBeep(440, 300); alertasDisparadas[idAlerta] = '10m'; }
            } else {
                tiempoTd.innerHTML = `⏳ ${hRestantes}h ${mRestantes}m ${sRestantes}s`;
                tiempoTd.className = "status-tiempo";
            }
        }
    });

    // 2. Calcular Top 10 de TODOS los bosses
    configBosses.forEach(boss => {
        servidores.forEach(sv => {
            let registro = datosGlobales.find(item => item.boss.toLowerCase().includes(boss.name.toLowerCase()) && item.servidor.toLowerCase().replace(/\s+/g, '') === sv.toLowerCase().replace(/\s+/g, ''));
            if(registro && registro.fecha) {
                let fMuerte = new Date(registro.fecha.replace(/-/g, '/'));
                if(!isNaN(fMuerte.getTime())) {
                    let diferencia = (fMuerte.getTime() + (boss.intervalo * 3600000)) - ahora;
                    let displayHTML = "";
                    let cls = "";
                    
                    if(diferencia <= 0) {
                        let tVivo = Math.abs(diferencia);
                        let hV = Math.floor(tVivo / 3600000);
                        let mV = Math.floor((tVivo % 3600000) / 60000);
                        let sV = Math.floor((tVivo % 60000) / 1000);
                        
                        displayHTML = `🟢 ¡VIVO! (+${hV}h ${mV}m ${sV}s)`;
                        cls = "status-vivo";
                    } else {
                        let h = Math.floor(diferencia / 3600000);
                        let m = Math.floor((diferencia % 3600000) / 60000);
                        let s = Math.floor((diferencia % 60000) / 1000);
                        displayHTML = `⏳ ${h}h ${m}m ${s}s`;
                        cls = (diferencia / 60000) <= 10 ? "alerta-10" : "status-tiempo";
                    }
                    top10Lista.push({ name: boss.name, sv: sv, dif: diferencia, html: displayHTML, cls: cls });
                }
            }
        });
    });

    // Ordenar Top 10 (Vivos primero, luego los más cercanos)
    top10Lista.sort((a, b) => a.dif - b.dif);
    let top10Final = top10Lista.slice(0, 10);
    
    const t10Body = document.getElementById("top10Body");
    if(t10Body) {
        t10Body.innerHTML = "";
        top10Final.forEach(b => {
            let tr = document.createElement("tr");
            tr.innerHTML = `<td><strong>${b.name}</strong></td><td>${b.sv}</td><td class="${b.cls}">${b.html}</td>`;
            t10Body.appendChild(tr);
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    cargarDatosServidor();
    setInterval(actualizarContadores, 1000);
    setInterval(cargarDatosServidor, 120000);
});
                                                           
