document.addEventListener('DOMContentLoaded', () => {
    const bossSelect = document.getElementById('bossSelect');
    const tablaBody = document.getElementById('tablaBody');
    const subInfo = document.getElementById('subInfo');
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
            if (res.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            const data = await res.json();

            if (data.success) {
                datosGlobales = data.registros;
                configGlobal = data.configBosses;

                poblarSelectBosses();
                actualizarTabla();
            }
        } catch (e) {
            console.error("Fallo al cargar datos:", e);
        }
    }

    function poblarSelectBosses() {
        if (!bossSelect) return;
        const valorActual = bossSelect.value;
        bossSelect.innerHTML = '';

        let index = 0;
        Object.keys(configGlobal).forEach(bossName => {
            const opt = document.createElement('option');
            opt.value = bossName;
            opt.textContent = `${bossName} (${Math.round(configGlobal[bossName].respawnMinutes / 60)}h)`;
            if (bossName === valorActual || (index === 0 && !valorActual)) opt.selected = true;
            bossSelect.appendChild(opt);
            index++;
        });
    }

    function parsearFechaMegaMu(fechaStr) {
        if (!fechaStr) return null;
        const partes = fechaStr.split(/[- :]/);
        if (partes.length < 6) return new Date(fechaStr);
        return new Date(partes[0], partes[1] - 1, partes[2], partes[3], partes[4], partes[5]);
    }

    function actualizarTabla() {
        if (!tablaBody || !bossSelect) return;

        const bossSeleccionado = bossSelect.value;
        const config = configGlobal[bossSeleccionado];
        if (!config) return;

        if (subInfo) {
            subInfo.textContent = `${bossSeleccionado.toUpperCase()} RESPAWN TRACKER | COOLDOWN ${Math.round(config.respawnMinutes / 60)} HORAS`;
        }

        const respawnMs = config.respawnMinutes * 60 * 1000;
        const registrosBoss = datosGlobales.filter(r => r.boss.toLowerCase() === bossSeleccionado.toLowerCase());
        const serversUnicos = ['Sv 1', 'Sv 2', 'Sv 3', 'Sv 4', 'Sv 5', 'Sv 6', 'Sv 7', 'Sv 8', 'Sv 10', 'Sv 11', 'Sv 12', 'Sv 14', 'Sv 15', 'Sv 16', 'Sv 17', 'Sv 19', 'Speed 1', 'Speed 2', 'Speed 3'];

        tablaBody.innerHTML = '';

        serversUnicos.forEach(sv => {
            const regSv = registrosBoss.find(r => r.servidor.toLowerCase() === sv.toLowerCase());
            
            let ultimaMuerteText = "Sin datos recientes";
            let cazadorText = "-";
            let proximaMuerteTime = null;
            let tiempoRestanteText = "N/A";
            let claseTiempo = "";

            if (regSv) {
                ultimaMuerteText = regSv.fecha;
                cazadorText = regSv.cazador;
                const fechaMuerte = parsearFechaMegaMu(regSv.fecha);

                if (fechaMuerte && !isNaN(fechaMuerte)) {
                    proximaMuerteTime = new Date(fechaMuerte.getTime() + respawnMs);
                    const msRestantes = proximaMuerteTime.getTime() - new Date().getTime();

                    const opcionesFecha = { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
                    const proximoRespawnEst = proximaMuerteTime.toLocaleString('es-VE', opcionesFecha);

                    if (msRestantes > 0) {
                        const horas = Math.floor(msRestantes / (1000 * 60 * 60));
                        const minutos = Math.floor((msRestantes % (1000 * 60 * 60)) / (1000 * 60));
                        const segundos = Math.floor((msRestantes % (1000 * 60)) / 1000);
                        tiempoRestanteText = `⏳ ${horas}h ${minutos}m ${segundos}s`;
                        claseTiempo = "status-tiempo";
                    } else {
                        tiempoRestanteText = "🟢 ¡RESPAWN DISPONIBLE!";
                        claseTiempo = "status-vivo";
                    }
                }
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${sv}</strong></td>
                <td>${ultimaMuerteText}</td>
                <td>${cazadorText}</td>
                <td>${proximaMuerteTime ? proximaMuerteTime.toLocaleString() : 'N/A'}</td>
                <td class="${claseTiempo}">${tiempoRestanteText}</td>
            `;
            tablaBody.appendChild(tr);
        });
    }

    if (bossSelect) {
        bossSelect.addEventListener('change', actualizarTabla);
    }

    cargarDatos();
    setInterval(cargarDatos, 30000);
});
