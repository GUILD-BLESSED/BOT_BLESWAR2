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
let socket = null;

// -------------------------------------------------------------------------
// FUNCIONES DE NOTIFICACIONES NATIVAS (CAPACITOR)
// -------------------------------------------------------------------------
async function solicitarPermisosNotificaciones() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        try {
            const perm = await window.Capacitor.Plugins.LocalNotifications.checkPermissions();
            if (perm.display !== 'granted') {
                await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
            }
        } catch (e) {
            console.log("⚠️ Error solicitando permisos de notificaciones:", e);
        }
    }
}

function generarIdNotificacion(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

// Programa la alerta en el teléfono 10 minutos antes de la hora de respawn
async function programarNotificacionLocal(bossName, servidor, fechaRespawn) {
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.LocalNotifications) return;

    // Calcular la hora exacta de la notificación: 10 minutos antes del respawn
    const tiempoAlerta = new Date(fechaRespawn.getTime() - (10 * 60 * 1000));
    const ahora = new Date();

    // Solo programar si la hora de la alerta aún no ha pasado
    if (tiempoAlerta > ahora) {
        const idNotif = generarIdNotificacion(`${bossName}-${servidor}-${fechaRespawn.getTime()}`);
        
        try {
            await window.Capacitor.Plugins.LocalNotifications.schedule({
                notifications: [
                    {
                        title: `⚠️ ¡Boss Cerca: ${bossName}!`,
                        body: `Faltan 10 minutos para que reaparezca ${bossName} en ${servidor}. ¡Alístate!`,
                        id: idNotif,
                        schedule: { at: tiempoAlerta },
                        smallIcon: "res://ic_stat_icon_config",
                        actionTypeId: "",
                        extra: null
                    }
                ]
            });
        } catch (e) {
            console.log("⚠️ Error al programar notificación:", e);
        }
    }
}

// Envía una notificación instantánea al teléfono cuando la app está abierta
async function enviarNotificacionInmediata(titulo, mensaje) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        try {
            await window.Capacitor.Plugins.LocalNotifications.schedule({
                notifications: [
                    {
                        title: titulo,
                        body: mensaje,
                        id: Math.floor(Math.random() * 100000),
                        schedule: { at: new Date(Date.now() + 500) }
                    }
                ]
            });
        } catch (e) {
            console.log("⚠️ Error al enviar notificación inmediata:", e);
        }
    }
}

function programarNotificacionesTodosBosses() {
    if (!configBosses.length || !datosGlobales.length) return;

    configBosses.forEach(boss => {
        servidores.forEach(sv => {
            let registro = datosGlobales.find(item => 
                item.boss.toLowerCase().includes(boss.name.toLowerCase()) && 
                item.servidor.toLowerCase().replace(/\s+/g, '') === sv.toLowerCase().replace(/\s+/g, '')
            );

            if (registro && registro.fecha) {
                let fMuerte = new Date(registro.fecha.replace(/-/g, '/'));
                if (!isNaN(fMuerte.getTime())) {
                    let fRespawn = new Date(fMuerte.getTime() + (boss.intervalo * 3600000));
                    programarNotificacionLocal(boss.name, sv, fRespawn);
                }
            }
        });
    });
}

// -------------------------------------------------------------------------
// FUNCIONES GENERALES Y ALERTAS SONORAS
// -------------------------------------------------------------------------
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
            programarNotificacionesTodosBosses();
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
                if(alertasDisparadas[idAlerta] !== '5m') { 
                    reproducirBeep(880, 400); 
                    enviarNotificacionInmediata(`⚠️ ¡5 MINUTOS!`, `El Boss ${bossActual.name} en ${sv} reaparece en 5 minutos.`);
                    alertasDisparadas[idAlerta] = '5m'; 
                }
            } else if ((diferencia / 60000) > 9.5 && (diferencia / 60000) <= 10.5) {
                tiempoTd.innerHTML = `🔔 **¡10 MINUTOS!** (${mRestantes}m ${sRestantes}s)`;
                tiempoTd.className = "alerta-10";
                if(alertasDisparadas[idAlerta] !== '10m') { 
                    reproducirBeep(440, 300); 
                    enviarNotificacionInmediata(`🔔 ¡10 MINUTOS!`, `El Boss ${bossActual.name} en ${sv} reaparece en 10 minutos.`);
                    alertasDisparadas[idAlerta] = '10m'; 
                }
            } else {
                tiempoTd.innerHTML = `⏳ ${hRestantes}h ${mRestantes}m ${sRestantes}s`;
                tiempoTd.className = "status-tiempo";
            }
        }
    });

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

// -------------------------------------------------------------------------
// FUNCIONES DE SOCKET.IO PARA EL CHAT EN TIEMPO REAL
// -------------------------------------------------------------------------
function inicializarChat() {
    socket = io();

    socket.on('chat_history', (messages) => {
        const chatBox = document.getElementById("chatMessages");
        if (!chatBox) return;
        chatBox.innerHTML = "";
        messages.forEach(msg => agregarMensajeAlDOM(msg));
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    socket.on('new_message', (msg) => {
        agregarMensajeAlDOM(msg);
        const chatBox = document.getElementById("chatMessages");
        if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    });
}

function agregarMensajeAlDOM(data) {
    const chatBox = document.getElementById("chatMessages");
    if (!chatBox) return;

    if (chatBox.querySelector('div[style*="text-align: center"]')) {
        chatBox.innerHTML = "";
    }

    const div = document.createElement("div");
    div.className = "chat-message-item";
    
    const nickMostrar = data.character_nick || data.username || "Anónimo";
    div.innerHTML = `<span class="chat-nick">[${nickMostrar}]:</span> ${escapeHtml(data.message)}`;
    chatBox.appendChild(div);
}

function enviarMensaje() {
    const input = document.getElementById("chatInput");
    if (!input) return;
    const texto = input.value.trim();
    if (texto === "") return;

    if (socket) {
        socket.emit('send_message', texto);
        input.value = "";
    }
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        enviarMensaje();
    }
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// -------------------------------------------------------------------------
// INICIALIZACIÓN
// -------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    solicitarPermisosNotificaciones();
    cargarDatosServidor();
    inicializarChat();
    setInterval(actualizarContadores, 1000);
    setInterval(cargarDatosServidor, 120000);
});
                                            
