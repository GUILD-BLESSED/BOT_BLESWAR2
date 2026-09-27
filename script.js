// Lista de servidores que se mostrarán en la tabla (puedes ajustar o agregar más)
const servidores = ["Sv 1", "Sv 2", "Sv 3", "Sv 4", "Sv 5", "Sv 6", "Sv 7", "Sv 8", "Sv 14", "Sv 15", "Sv 16"];

let bossActualIndex = 0;

// Cargar opciones en el selector de Bosses
function inicializarSelect() {
    const select = document.getElementById("bossSelect");
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

// Obtener datos guardados en el navegador
function obtenerDatosGuardados() {
    let datos = localStorage.getItem("bleswar_boss_data");
    return datos ? JSON.parse(datos) : {};
}

function guardarDatos(datos) {
    localStorage.setItem("bleswar_boss_data", JSON.stringify(datos));
}

function renderTabla() {
    const boss = configBosses[bossActualIndex];
    document.getElementById("subInfoinnerText = `${boss.name.toUpperCase()} RESPAWN TRACKER | COOLDOWN ${boss.intervalo} HORAS`;

    const tbody = document.getElementById("tablaBody");
    tbody.innerHTML = "";

    let todosDatos = obtenerDatosGuardados();
    let keyBoss = boss.name;
    if (!todosDatos[keyBoss]) todosDatos[keyBoss] = {};

    servidores.forEach(sv => {
        let infoSv = todosDatos[keyBoss][sv] || { fecha: "", cazador: "-" };
        
        let tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${sv}</strong></td>
            <td><input type="text" id="fecha-${sv}" value="${infoSv.fecha}" placeholder="DD/MM HH:MM" style="background:#0b1329; color:#fff; border:1px solid #233b63; padding:4px; border-radius:4px; width:110px;"></td>
            <td><input type="text" id="cazador-${sv}" value="${infoSv.cazador}" placeholder="Nombre" style="background:#0b1329; color:#fff; border:1px solid #233b63; padding:4px; border-radius:4px; width:90px;"></td>
            <td id="respawn-${sv}">--/-- --:--</td>
            <td id="tiempo-${sv}">Calculando...</td>
            <td><button class="btn-action" onclick="actualizarRegistro('${sv}')">Guardar</button></td>
        `;
        tbody.appendChild(tr);
    });

    actualizarContadores();
}

function actualizarRegistro(sv) {
    const boss = configBosses[bossActualIndex];
    let fechaVal = document.getElementById(`fecha-${sv}`).value.trim();
    let cazadorVal = document.getElementById(`cazador-${sv}`).value.trim();

    let todosDatos = obtenerDatosGuardados();
    if (!todosDatos[boss.name]) todosDatos[boss.name] = {};

    todosDatos[boss.name][sv] = { fecha: fechaVal, cazador: cazadorVal };
    guardarDatos(todosDatos);
    
    alert(`¡Datos guardados para ${boss.name} en ${sv}!\nNota: Formato sugerido para fecha/hora: AAAA-MM-DDTHH:MM o similar.`);
    actualizarContadores();
}

function actualizarContadores() {
    const boss = configBosses[bossActualIndex];
    let todosDatos = obtenerDatosGuardados();
    let datosBoss = todosDatos[boss.name] || {};
    const ahora = new Date();

    servidores.forEach(sv => {
        let info = datosBoss[sv];
        let respawnTd = document.getElementById(`respawn-${sv}`);
        let tiempoTd = document.getElementById(`tiempo-${sv}`);

        if (!info || !info.fecha) {
            if(respawnTd) respawnTd.innerText = "Sin datos";
            if(tiempoTd) {
                tiempoTd.innerText = "N/A";
                tiempoTd.className = "";
            }
            return;
        }

        // Procesar fecha ingresada (Ej formato estándar tipo "2026-09-26 21:00" o reemplazando barras)
        let textoFechaLimpia = info.fecha.replace(/-/g, '/');
        let fMuerte = new Date(textoFechaLimpia);

        if (isNaN(fMuerte.getTime())) {
            if(respawnTd) respawnTd.innerText = "Formato inválido";
            if(tiempoTd) tiempoTd.innerText = "Error";
            return;
        }

        // Sumar el intervalo del boss en milisegundos (horas * 3600000)
        let fRespawn = new Date(fMuerte.getTime() + (boss.intervalo * 3600000));
        let diferencia = fRespawn - ahora;

        // Mostrar fecha de respawn estimada
        respawnTd.innerText = fRespawn.toLocaleString('es-VE', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

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

// Inicializar al cargar la página
document.addEventListener("DOMContentLoaded", () => {
    inicializarSelect();
    renderTabla();
    // Actualizar contadores cada segundo en tiempo real
    setInterval(actualizarContadores, 1000);
});
                                                  
