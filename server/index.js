const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// RAM'de odaları tutacağımız obje (Geçici Veritabanı)
// Yapısı: { "123456": { host: "socket_id", players: { "socket_id": "player1" } } }
const rooms = {};

// Rastgele ve KESİNLİKLE BENZERSİZ 6 haneli rakam üreten fonksiyon
function generateUniquePIN() {
    let pin;
    do {
        // 100000 ile 999999 arasında rastgele bir sayı üret
        pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms[pin]); // Eğer üretilen pin zaten rooms objesinde varsa, başa dön ve yeni üret!
    
    return pin;
}

io.on('connection', (socket) => {
    console.log('🔌 Yeni bağlantı:', socket.id);

    // 1. HOST (Web Ekranı) ODA OLUŞTURMA
    socket.on('create-room', () => {
        const pin = generateUniquePIN(); // Artık benzersiz üretiyoruz!
        rooms[pin] = { host: socket.id, players: {} };
        socket.join(pin); 
        
        socket.emit('room-created', pin);
        console.log(`🏠 Oda oluşturuldu. PIN: ${pin} | Host: ${socket.id}`);
    });

    // 2. PLAYER (Mobil/Saat) ODAYA KATILMA
    socket.on('join-room', (pin) => {
        if (rooms[pin]) {
            const playerCount = Object.keys(rooms[pin].players).length;
            
            // Maksimum 2 oyuncu sınırı
            if (playerCount >= 2) {
                socket.emit('join-error', 'Oda kapasitesi dolu!');
                return;
            }

            // İlk girene Player 1, ikinciye Player 2 rolünü ver
            const role = playerCount === 0 ? 'player1' : 'player2';
            rooms[pin].players[socket.id] = role;
            
            socket.join(pin); // Oyuncuyu odaya ekle
            
            // 1. Oyuncuya başarı mesajı dön
            socket.emit('joined-success', { pin, role });
            // 2. Host'a (Bilgisayar ekranına) yeni oyuncunun geldiğini bildir
            io.to(rooms[pin].host).emit('player-joined', { playerId: socket.id, role });
            
            console.log(`🎮 Oyuncu katıldı. PIN: ${pin} | Rol: ${role} | Socket: ${socket.id}`);
        } else {
            socket.emit('join-error', 'Geçersiz veya süresi dolmuş PIN!');
        }
    });

    // 3. SENSÖR VERİSİ İLETİMİ VE KENDİ İSTEĞİYLE ÇIKIŞ (Mobil -> Host)
    socket.on('motion-data', (data) => {
        const { pin, mode, inputs } = data; 
        
        // TELEFONDAN BİLEREK "BAĞLANTIYI KES" YAPILDIYSA:
        if (mode === 'disconnect_me') {
            if (rooms[pin] && rooms[pin].players[socket.id]) {
                const role = rooms[pin].players[socket.id];
                delete rooms[pin].players[socket.id]; // Oyuncuyu odadan sil
                io.to(rooms[pin].host).emit('player-left', { playerId: socket.id, role }); // Web ekranına haber ver
                socket.leave(pin); // Soket grubundan çık
                console.log(`👋 Oyuncu kendi isteğiyle ayrıldı. PIN: ${pin} | Rol: ${role}`);
            }
            return; // Veri işlemeyi durdur
        }

        // NORMAL SENSÖR/BUTON VERİSİ AKTARIMI
        if (rooms[pin] && rooms[pin].players[socket.id]) {
            const role = rooms[pin].players[socket.id];
            // Sensör verisini, oyuncunun rolüyle birlikte sadece o odadaki Host'a (oyun ekranına) fırlat
            io.to(rooms[pin].host).emit('update-game', { role, motion: { mode, inputs } });
        }
    });

    // 4. BEKLENMEDİK BAĞLANTI KOPMASI VE TEMİZLİK (Garbage Collection)
    socket.on('disconnect', () => {
        for (const pin in rooms) {
            // A. Kopan kişi oyunu açan Host (Web Sitesi) ise:
            if (rooms[pin].host === socket.id) {
                io.to(pin).emit('host-disconnected', 'Oyun kurucusu ayrıldı, oda kapatıldı.');
                delete rooms[pin];
                console.log(`🧹 Oda temizlendi (Host ayrıldı): ${pin}`);
                break;
            } 
            // B. Kopan kişi oyunculardan biriyse (İnterneti falan kesildiyse):
            else if (rooms[pin].players[socket.id]) {
                const role = rooms[pin].players[socket.id];
                delete rooms[pin].players[socket.id];
                
                // Kalan Host'a (Web Sitesi) oyuncunun düştüğünü haber ver
                if (rooms[pin]) {
                    io.to(rooms[pin].host).emit('player-left', { playerId: socket.id, role });
                }
                console.log(`🚪 Oyuncu bağlantısı koptu. PIN: ${pin} | Rol: ${role}`);
                break;
            }
        }
    });
});

const PORT = 3000;
// 0.0.0.0 dinleyerek tüm yerel ağa açık hale getiriyoruz
server.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 NexusPad Server çalışıyor: Port ${PORT}`);
});