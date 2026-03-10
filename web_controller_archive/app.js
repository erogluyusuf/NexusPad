const socket = io('http://192.168.1.200:3000'); // Pi 5 IP'si ve Soket Portu

const rollEl = document.getElementById('roll');
const pitchEl = document.getElementById('pitch');
const yawEl = document.getElementById('yaw');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('start-btn');

// Ekrana anlık log basmak için fonksiyon
function log(msg, color = "white") {
    statusEl.innerHTML += `<br><span style="color:${color}">${msg}</span>`;
}

statusEl.innerHTML = "Soket bağlantısı deneniyor...";

socket.on('connect', () => {
    log("✅ Soket Bağlandı! ID: " + socket.id, "#4caf50");
});

socket.on('connect_error', (err) => {
    log("❌ Soket Hatası: " + err.message, "#f44336");
});

startBtn.addEventListener('click', () => {
    log("⏳ Sensör başlatılıyor...", "yellow");
    
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', (event) => {
            // Chrome sensöre erişemezse değerleri null döndürür
            if (event.alpha === null) {
                log("❌ Sensör verisi NULL. Chrome güvenlik engeli!", "#f44336");
                return;
            }

            const data = {
                yaw: Math.round(event.alpha),
                pitch: Math.round(event.beta),
                roll: Math.round(event.gamma)
            };

            rollEl.innerText = data.roll;
            pitchEl.innerText = data.pitch;
            yawEl.innerText = data.yaw;

            socket.emit('motion-data', data);
        });
        startBtn.style.display = 'none';
        log("✅ Sensör dinleniyor!", "#4caf50");
    } else {
        log("❌ Bu cihaz/tarayıcı DeviceOrientation desteklemiyor.", "#f44336");
    }
});