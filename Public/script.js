const servidores = ["Sv 1", "Sv 2", "Sv 3", "Sv 4", "Sv 5", "Sv 6", "Sv 7", "Sv 8", "Sv 14", "Sv 15", "Sv 16"];
let bossActualIndex = 0;
let datosGlobales = [];
let configBosses = [];

async function cargarDatosServidor() {
    try {
        const response = await fetch('/api/bosses');
        const data = await response.json();
        if (data.success) {
            datosGlobales = data.registros;
            configBosses = data.configBosses;
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
        let registro = datosGlobales.find(item => 
            item.boss.toLowerCase().includes(boss.name.toLowerCase()) && 
            item.servidor.toLowerCase() === sv.toLowerCase()
        );

        let fechaMuerte = registro ? registro.fecha : "Sin datos recientes";
        let cazador = registro ? registro.cazador : "-";

        let tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${sv}</strong></td>
            <td id="fecha-${sv}">${fechaMuerte}</td>
            <td>${cazador}</td>
            <td id="respawn-${sv}">--/-- --:--</td>
            <td id="tiempo-${sv}">Calculando...</td>
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
        let fechaTd = document.getElementById(`fecha-${sv}`);
        if (!fechaTd) return;
        let fechaTexto = fechaTd.innerText.trim();

        let respawnTd = document.getElementById(`respawn-${sv}`);
        let tiempoTd = document.getElementById(`tiempo-${sv}`);

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
    });
}

document.addEventListener("DOMContentLoaded", () => {
    cargarDatosServidor();
    // Actualizar contadores locales cada segundo
    setInterval(actualizarContadores, 1000);
    // Recargar datos frescos del servidor web scraping cada 2 minutos
    setInterval(cargarDatosServidor, 120000);
});
