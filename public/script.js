let datosGlobales = [];
let configBossesGlobal = {};
let audioActivado = false;
let audioAlerta = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');

async function cargarDatos() {
    try {
        const res = await fetch('/api/bosses');
        const data = await res.json();
        
        if(data.success) {
            datosGlobales = data.registros;
            configBossesGlobal = data.configBosses;

            document.getElementById("userInfo").innerText = `Usuario: ${data.user.username} (${data.user.nickname || 'Sin Nick'})`;
            if(data.user.role === 'admin') {
                document.getElementById("adminLinkContainer").innerHTML = `<a href="/admin.html" class="admin-link">⚙️ Panel Admin</a>`;
            }

            const select = document.getElementById("bossSelect");
            if(select.options.length <= 1) {
                select.innerHTML = '<option value="TODOS">-- Todos los Bosses --</option>';
                for(let bossName in configBossesGlobal) {
                    let opt = document.createElement("option");
                    opt.value = bossName;
                    opt.innerText = bossName;
                    select.appendChild(opt);
                }
            }

            actualizarTablas();
        }
    } catch(e) {
        console.error("Error cargando los datos:", e);
    }
}

function cambiarBoss() {
    actualizarTablas();
}

function activarAudio() {
    audioActivado = true;
    audioAlerta.play().catch(() => {});
    document.getElementById("btnAudio").innerText = "🔊 Alertas Activadas";
    document.getElementById("btnAudio").style.backgroundColor = "#22c55e";
}

function parsearFecha(fechaStr) {
    if (!fechaStr) return null;
    let partes = fechaStr.split(" ");
    if(partes.length < 2) return null;
    let fechaPartes = partes[0].split("/");
    let horaPartes = partes[1].split(":");
    if(fechaPartes.length < 3 || horaPartes.length < 3) return null;
    return new Date(fechaPartes[2], fechaPartes[1] - 1, fechaPartes[0], horaPartes[0], horaPartes[1], horaPartes[2]);
}

function actualizarTablas() {
    const selectBoss = document.getElementById("bossSelect");
    const bossSeleccionado = selectBoss ? selectBoss.value : "TODOS";
    const tbody = document.getElementById("tablaBody");
    const tbodyProximos = document.getElementById("tablaProximosBody");
    
    if (!tbody || !tbodyProximos) return;

    tbody.innerHTML = "";
    let listaProximos = [];
    let alertaSonando = false;

    let mapaBossesServidor = {};
    datosGlobales.forEach(reg => {
        let clave = reg.boss + "_" + reg.servidor;
        if(!mapaBossesServidor[clave]) {
            mapaBossesServidor[clave] = reg;
        }
    });

    let filasTablaPrincipal = [];

    for(let clave in mapaBossesServidor) {
        let reg = mapaBossesServidor[clave];
        let conf = configBossesGlobal[reg.boss];
        
        if(conf && conf.respawnMinutes) {
            let fechaMuerte = parsearFecha(reg.fecha);
            if(fechaMuerte) {
                let respawnMs = conf.respawnMinutes * 60 * 1000;
                let fechaRespawn = new Date(fechaMuerte.getTime() + respawnMs);
                let ahora = new Date();
                let diferenciaMs = fechaRespawn - ahora;

                if(diferenciaMs > -300000) {
                    listaProximos.push({
                        boss: reg.boss,
                        servidor: reg.servidor,
                        fechaRespawn: fechaRespawn,
                        diferenciaMs: diferenciaMs
                    });
                }

                if(bossSeleccionado === "TODOS" || reg.boss === bossSeleccionado) {
                    let estadoHtml = "";
                    let claseCss = "";

                    if(diferenciaMs <= 0) {
                        estadoHtml = `<span class="status-vivo">¡VIVO / YA RESPONDIÓ!</span>`;
                    } else {
                        let minsRestantes = Math.floor(diferenciaMs / 60000);
                        let horas = Math.floor(minsRestantes / 60);
                        let mins = minsRestantes % 60;
                        let secs = Math.floor((diferenciaMs % 60000) / 1000);
                        let tiempoTexto = (horas > 0 ? horas + "h " : "") + mins + "m " + secs + "s";

                        if(diferenciaMs <= 300000) {
                            claseCss = "alerta-5";
                            alertaSonando = true;
                        } else if(diferenciaMs <= 600000) {
                            claseCss = "alerta-10";
                        }

                        estadoHtml = `<span class="status-tiempo ${claseCss}">${tiempoTexto}</span>`;
                    }

                    filasTablaPrincipal.push({
                        servidor: reg.servidor,
                        fecha: reg.fecha,
                        cazador: reg.cazador,
                        respawnStr: fechaRespawn.toLocaleTimeString(),
                        estadoHtml: estadoHtml,
                        diferenciaMs: diferenciaMs
                    });
                }
            }
        }
    }

    if(filasTablaPrincipal.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No hay registros para este jefe.</td></tr>`;
    } else {
        filasTablaPrincipal.sort((a, b) => a.diferenciaMs - b.diferenciaMs);
        filasTablaPrincipal.forEach(f => {
            tbody.innerHTML += `<tr>
                <td><b>${f.servidor}</b></td>
                <td>${f.fecha}</td>
                <td>${f.cazador}</td>
                <td>${f.respawnStr}</td>
                <td>${f.estadoHtml}</td>
            </tr>`;
        });
    }

    listaProximos.sort((a, b) => a.diferenciaMs - b.diferenciaMs);
    let top20 = listaProximos.slice(0, 20);
    tbodyProximos.innerHTML = "";

    if(top20.length === 0) {
        tbodyProximos.innerHTML = `<tr><td colspan="4" style="text-align:center;">Sin datos de próximos respawns.</td></tr>`;
    } else {
        top20.forEach(item => {
            let minsRestantes = Math.floor(item.diferenciaMs / 60000);
            let tiempoTexto = "¡VIVO!";
            let claseCss = "status-vivo";

            if(item.diferenciaMs > 0) {
                let horas = Math.floor(minsRestantes / 60);
                let mins = minsRestantes % 60;
                let secs = Math.floor((item.diferenciaMs % 60000) / 1000);
                tiempoTexto = (horas > 0 ? horas + "h " : "") + mins + "m " + secs + "s";
                
                if(item.diferenciaMs <= 300000) claseCss = "alerta-5";
                else if(item.diferenciaMs <= 600000) claseCss = "alerta-10";
                else claseCss = "status-tiempo";
            }

            tbodyProximos.innerHTML += `<tr>
                <td><b>${item.boss}</b></td>
                <td>${item.servidor}</td>
                <td>${item.fechaRespawn.toLocaleTimeString()}</td>
                <td><span class="${claseCss}">${tiempoTexto}</span></td>
            </tr>`;
        });
    }

    if(audioActivado && alertaSonando) {
        audioAlerta.play().catch(() => {});
    }
}

cargarDatos();
setInterval(cargarDatos, 30000);
