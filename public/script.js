document.addEventListener('DOMContentLoaded', () => {
    const bossSelect = document.getElementById('bossSelect');
    const tablaPrincipalBody = document.getElementById('tablaPrincipalBody');
    const proximosRespawnsBody = document.getElementById('proximosRespawnsBody');
    const btnSonido = document.getElementById('btnSonido');

    let datosGlobales = [];
    let configGlobal = {};
    let audioHabilitado = false;

    if (btnSonido) {
        btnSonido.addEventListener('click', () => {
            audioHabilitado = true;
            btnSonido.textContent = '🔊 Alertas Sonoras Activas';
            btnSonido.style.background = '#27ae60';
        });
    }

    async function cargarDatos() {
        try {
            const res = await fetch('/api/bosses');
            const data = await res.json();

            if (data.success) {
                datosGlobales = data.registros;
                configGlobal = data.configBosses;

                poblarSelectBosses();
                actualizarTablas();
            } else {
                console.error("Error al obtener datos:", data.error);
            }
        } catch (e) {
            console.error("Fallo de conexión con la API:", e);
        }
    }

    function poblarSelectBosses() {
        if (!bossSelect) return;
        const valorActual = bossSelect.value;
        bossSelect.innerHTML = '<option value="todos">-- Todos los Bosses --</option>';

        Object.keys(configGlobal).forEach(bossName => {
            const opt = document.createElement('option');
            opt.value = bossName;
            opt.textContent = `${bossName} (${Math.round(configGlobal[bossName].respawnMinutes / 60)}h)`;
            if (bossName === valorActual) opt.selected = true;
            bossSelect.appendChild(opt);
        });
    }

    function parsearFechaMegaMu(fechaStr) {
        // Formato esperado: "YYYY-MM-DD HH:MM:SS"
        if (!fechaStr) return null;
        const partes = fechaStr.split(/[- :]/);
        if (partes.length < 6) return new Date(fechaStr);
        return new Date(partes[0], partes[1] - 1, partes[2], partes[3], partes[4], partes[5]);
    }

    function actualizarTablas() {
        if (!tablaPrincipalBody || !proximosRespawnsBody) return;

        const bossSeleccionado = bossSelect ? bossSelect.value : 'todos';
        tablaPrincipalBody.innerHTML = '';
        proximosRespawnsBody.innerHTML = '';

        let listaProximos = [];

        // Agrupar la última muerte por servidor para cada jefe configurado
        Object.keys(configGlobal).forEach(bossName => {
            if (bossSeleccionado !== 'todos' && bossSeleccionado !== bossName) return;

            const config = configGlobal[bossName];
            const respawnMs = config.respawnMinutes * 60 * 1000;

            // Filtrar registros de la web para este jefe específico
            const registrosBoss = datosGlobales.filter(r => r.boss.toLowerCase() === bossName.toLowerCase());

            // Agrupar por servidor
            const serversUnicos = ['Sv 1', 'Sv 2', 'Sv 3', 'Sv 4', 'Sv 5', 'Sv 6', 'Sv 7', 'Sv 8', 'Sv 10', 'Sv 11', 'Sv 12', 'Sv 14', 'Sv 15', 'Sv 16', 'Sv 17', 'Sv 19', 'Speed 1', 'Speed 2', 'Speed 3'];

            serversUnicos.forEach(sv => {
                const regSv = registrosBoss.find(r => r.servidor.toLowerCase() === sv.toLowerCase());
                
                let ultimaMuerteText = "Sin datos recientes";
                let cazadorText = "-";
                let proximaMuerteTime = null;
                let tiempoRestanteText = "N/A";
                let msRestantes = 0;

                if (regSv) {
                    ultimaMuerteText = regSv.fecha;
                    cazadorText = regSv.cazador;
                    const fechaMuerte = parsearFechaMegaMu(regSv.fecha);

                    if (fechaMuerte && !isNaN(fechaMuerte)) {
                        proximaMuerteTime = new Date(fechaMuerte.getTime() + respawnMs);
                        msRestantes = proximaMuerteTime.getTime() - new Date().getTime();

                        const opcionesFecha = { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
                        proximoRespawnEst = proximaMuerteTime.toLocaleString('es-VE', opcionesFecha);

                        if (msRestantes > 0) {
                            const horas = Math.floor(msRestantes / (1000 * 60 * 60));
                            const minutos = Math.floor((msRestantes % (1000 * 60 * 60)) / (1000 * 60));
                            const segundos = Math.floor((msRestantes % (1000 * 60)) / 1000);
                            tiempoRestanteText = `⏳ ${horas}h ${minutos}m ${segundos}s`;
                        } else {
                            tiempoRestanteText = "🟢 ¡RESPAWN DISPONIBLE!";
                        }

                        listaProximos.push({
                            boss: bossName,
                            servidor: sv,
                            proximoRespawn: proximaMuerteTime,
                            msRestantes: msRestantes,
                            textoRestante: tiempoRestanteText
                        });
                    }
                }

                // Fila de la tabla principal
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${sv}</strong></td>
                    <td>${ultimaMuerteText}</td>
                    <td>${cazadorText}</td>
                    <td>${proximaMuerteTime ? proximaMuerteTime.toLocaleString() : 'N/A'}</td>
                    <td>${tiempoRestanteText}</td>
                `;
                tablaPrincipalBody.appendChild(tr);
            });
        });

        // Ordenar y rellenar la tabla de Próximos 20 Respawns
        listaProximos.sort((a, b) => a.msRestantes - b.msRestantes);
        const top20 = listaProximos.slice(0, 20);

        if (top20.length === 0) {
            proximosRespawnsBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Sin datos de próximos respawns.</td></tr>`;
        } else {
            top20.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${item.boss}</strong></td>
                    <td>${item.servidor}</td>
                    <td>${item.proximoRespawn.toLocaleString()}</td>
                    <td>${item.textoRestante}</td>
                `;
                proximosRespawnsBody.appendChild(tr);
            });
        }
    }

    if (bossSelect) {
        bossSelect.addEventListener('change', actualizarTablas);
    }

    // Cargar al iniciar y actualizar cada 30 segundos
    cargarDatos();
    setInterval(cargarDatos, 30000);
});
