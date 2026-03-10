import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { io } from 'socket.io-client';

// ==========================================
// 1. SOKET VE LOBİ YÖNETİMİ 
// ==========================================
const socket = io('http://192.168.1.200:3000'); 

const lobbyEl = document.getElementById('lobby');
const gameContainer = document.getElementById('game');
gameContainer.innerHTML = ''; 

const racingDiv = document.createElement('div');
const flightDiv = document.createElement('canvas'); 
const shooterDiv = document.createElement('div');

racingDiv.style.display = 'none';
flightDiv.style.display = 'none';
shooterDiv.style.display = 'none';

gameContainer.appendChild(racingDiv);
gameContainer.appendChild(flightDiv);
gameContainer.appendChild(shooterDiv);

let currentMode = 'lobby'; 
let activeAnimFrame = null; 
let myRoomPin = '----'; 
let isMultiplayerMode = false; // Hangi modda olduğumuzu tutar

let players = {
    player1: { active: false, inputs: {} },
    player2: { active: false, inputs: {} }
};

function showGameMenuUI() {
    let p1Status = players.player1.active ? '<span style="color:#00ff00">P1 Bağlı</span>' : '<span style="color:#666">P1 Bekleniyor...</span>';
    let p2Status = players.player2.active ? '<span style="color:#00ff00">P2 Bağlı</span>' : '<span style="color:#666">P2 Bekleniyor...</span>';

    lobbyEl.innerHTML = `
        <div style="position: absolute; top: 20px; right: 30px; font-size: 24px; color: #aaa; background: #222; padding: 10px 20px; border-radius: 10px; border: 1px solid #444;">
            Oda PIN: <strong style="color: #00ffff; letter-spacing: 3px;">${myRoomPin}</strong>
        </div>

        <h1 style="color: #fff; font-size: 30px; letter-spacing: 2px;">KONSOL LOBİSİ</h1>
        <div style="display:flex; gap:20px; font-size:18px; margin-bottom: 20px;">
            <div>${p1Status}</div> | <div>${p2Status}</div>
        </div>
        <p style="font-size: 18px; color: #888;">Oynamak için telefondan bir mod seçin...</p>
    `;
}

socket.on('connect', () => { socket.emit('create-room'); });

socket.on('room-created', (pin) => {
    myRoomPin = pin;
    lobbyEl.innerHTML = `
        <h1 style="color: #aaa; letter-spacing: 2px; font-size: 20px;">NEXUSPAD SİSTEMİ</h1>
        <h2 style="font-size: 5rem; font-weight: bold; color: #fff; margin: 10px 0;">${myRoomPin}</h2>
        <p style="color: #666; font-size: 1rem;">Telefonunuzdan PIN kodunu girerek bağlanın.</p>
    `;
});

socket.on('player-joined', (data) => {
    players[data.role].active = true;
    if (currentMode === 'lobby') showGameMenuUI();
});

socket.on('player-left', (data) => {
    if (data.role && players[data.role]) {
        players[data.role].active = false;
        players[data.role].inputs = {};
    }
    
    if (!players.player1.active && !players.player2.active) {
        currentMode = 'lobby';
        if (activeAnimFrame) cancelAnimationFrame(activeAnimFrame);
        gameContainer.style.display = 'none';
        racingDiv.style.display = 'none'; flightDiv.style.display = 'none'; shooterDiv.style.display = 'none';
        
        lobbyEl.style.display = 'flex'; 
        lobbyEl.innerHTML = `
            <h1 style="color: #aaa; letter-spacing: 2px; font-size: 20px;">HERKES KOPTU</h1>
            <h2 style="font-size: 5rem; font-weight: bold; color: #ff4444; margin: 10px 0;">${myRoomPin}</h2>
            <p style="color: #ff4444; font-size: 1rem;">Oyuncular bekleniyor...</p>
        `;
    } else {
        if (currentMode === 'lobby') showGameMenuUI();
    }
});

socket.on('update-game', (data) => {
    const role = data.role; 
    const motionData = data.motion;
    if (!motionData) return;

    if (motionData.mode && motionData.mode !== currentMode) {
        switchGameMode(motionData.mode);
    }
    
    if (motionData.inputs && players[role]) {
        players[role].active = true;
        players[role].inputs = motionData.inputs;
    }
});

function switchGameMode(newMode) {
    currentMode = newMode;
    if (activeAnimFrame) cancelAnimationFrame(activeAnimFrame);

    if (newMode === 'menu') {
        gameContainer.style.display = 'none';
        lobbyEl.style.display = 'flex';
        showGameMenuUI();
        return;
    }

    lobbyEl.style.display = 'none';
    gameContainer.style.display = 'block'; 

    racingDiv.style.display = 'none';
    flightDiv.style.display = 'none';
    shooterDiv.style.display = 'none';

    // 1P ve 2P Ayırımı Burada Yapılıyor!
    if (newMode === 'racing_1p') {
        isMultiplayerMode = false;
        racingDiv.style.display = 'block';
        initRacingGame();
    } else if (newMode === 'racing_2p') {
        isMultiplayerMode = true;
        racingDiv.style.display = 'block';
        initRacingGame();
    } else if (newMode === 'flight_1p') {
        isMultiplayerMode = false;
        flightDiv.style.display = 'block';
        initFlightGame();
    } else if (newMode === 'flight_2p') {
        isMultiplayerMode = true;
        flightDiv.style.display = 'block';
        initFlightGame();
    } else if (newMode === 'shooter') {
        shooterDiv.style.display = 'block';
        initShooterGame();
    }
}


// ==========================================
// 2. ARABA YARIŞI MOTORU (1P ve 2P Uyumlu, Düzeltilmiş Trafik)
// ==========================================
let raceScene, raceCamera, raceRenderer, roadGrid;
let traffic = [], loadedTrafficModels = []; 
let singlePlayerSpeed = 0.5; // Sadece 1P modunda kullanılır

let p1Race = { group: null, x: 0, targetX: 0, z: 0, score: 0, dead: false, color: '#00ffcc' };
let p2Race = { group: null, x: 0, targetX: 0, z: 0, score: 0, dead: false, color: '#ff3366' };

const laneCenters = [-6, -2, 2, 6]; 
const roadWidth = 16; 

function initRacingGame() {
    racingDiv.innerHTML = ''; 
    traffic = [];
    singlePlayerSpeed = 0.5;
    
    // Modlara göre başlangıç pozisyonları
    if (isMultiplayerMode) {
        p1Race = { group: null, x: -3, targetX: -3, z: 0, score: 0, dead: false, color: '#00ffcc' };
        p2Race = { group: null, x: 3, targetX: 3, z: 0, score: 0, dead: false, color: '#ff3366' };
    } else {
        // Tek oyunculuda araba sağ gidiş şeridinde başlar (x=2)
        p1Race = { group: null, x: 2, targetX: 2, z: 0, score: 0, dead: false, color: '#ffffff' };
    }

    const uiOverlay = document.createElement('div');
    if (isMultiplayerMode) {
        uiOverlay.style.cssText = "position:absolute; top:30px; width:100%; text-align:center; color:white; font-family:'Segoe UI', Arial; pointer-events:none; z-index:100; display:flex; justify-content:space-around;";
        uiOverlay.innerHTML = `
            <div style="font-size:24px; font-weight:bold; color:${p1Race.color};">P1 SKOR: <span id="p1Score">0</span><br><span id="p1Msg" style="color:#ff4444; display:none;">KAZA!</span></div>
            <div style="font-size:24px; font-weight:bold; color:${p2Race.color};">P2 SKOR: <span id="p2Score">0</span><br><span id="p2Msg" style="color:#ff4444; display:none;">KAZA!</span></div>
        `;
    } else {
        // 1P İÇİN TEK SKOR VE HIZ EKRANI
        uiOverlay.style.cssText = "position:absolute; top:30px; width:100%; text-align:center; color:white; font-family:'Segoe UI', Arial; pointer-events:none; z-index:100;";
        uiOverlay.innerHTML = `
            <div style="font-size:32px; font-weight:bold; text-shadow:2px 2px 4px #000;">SKOR: <span id="p1Score">0</span> <br><span style="font-size:16px; color:#00ffff" id="speedVal">HIZ: 50 KM/H</span></div>
            <div id="p1Msg" style="font-size:50px; color:#ff4444; font-weight:bold; display:none; margin-top:20px; text-shadow:2px 2px 4px #000;">KAZA YAPTIN!</div>
        `;
    }
    racingDiv.appendChild(uiOverlay);

    raceScene = new THREE.Scene();
    raceScene.background = new THREE.Color(0x87ceeb);
    raceScene.fog = new THREE.FogExp2(0x87ceeb, 0.025); 

    raceCamera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    raceCamera.position.set(0, 10, 18); 
    raceCamera.lookAt(0, 0, -5);

    raceRenderer = new THREE.WebGLRenderer({ antialias: true });
    raceRenderer.setSize(window.innerWidth, window.innerHeight);
    raceRenderer.shadowMap.enabled = true;
    racingDiv.appendChild(raceRenderer.domElement);

    raceScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(10, 40, 10); sun.castShadow = true;
    raceScene.add(sun);

    const roadGroup = new THREE.Group();
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, 2000), new THREE.MeshStandardMaterial({ color: 0x2b2b2d, roughness: 0.9 }));
    asphalt.rotation.x = -Math.PI / 2; asphalt.receiveShadow = true;
    roadGroup.add(asphalt);

    const barrierGeo = new THREE.BoxGeometry(1, 1.5, 2000);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x888a8d }); 
    const leftBarrier = new THREE.Mesh(barrierGeo, barrierMat); leftBarrier.position.set(-8.25, 0.75, 0);
    const rightBarrier = leftBarrier.clone(); rightBarrier.position.x = 8.25;
    roadGroup.add(leftBarrier, rightBarrier);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });

    for (let i = 0; i < 150; i++) {
        const midLine1 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 10), yellowLineMat);
        midLine1.rotation.x = -Math.PI / 2; midLine1.position.set(-0.2, 0.02, -i * 10);
        const midLine2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 10), yellowLineMat);
        midLine2.rotation.x = -Math.PI / 2; midLine2.position.set(0.2, 0.02, -i * 10);
        roadGroup.add(midLine1, midLine2);

        if (i % 2 === 0) { 
            [-4, 4].forEach(offsetX => {
                const line = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 5), lineMat);
                line.rotation.x = -Math.PI / 2; line.position.set(offsetX, 0.02, -i * 10);
                roadGroup.add(line);
            });
        }
    }
    raceScene.add(roadGroup);
    roadGrid = roadGroup;

    loadModels();
    animateRacing();
}

function loadModels() {
    const loader = new GLTFLoader();
    
    loader.load('/models/race-future.glb', (gltf) => {
        p1Race.group = new THREE.Group();
        let c1 = gltf.scene; c1.rotation.y = Math.PI; 
        c1.traverse(child => { if (child.isMesh) child.castShadow = true; });
        p1Race.group.add(c1);
        p1Race.group.position.x = p1Race.x;
        raceScene.add(p1Race.group);

        if (isMultiplayerMode) {
            p2Race.group = new THREE.Group();
            let c2 = gltf.scene.clone(); c2.rotation.y = Math.PI;
            c2.traverse(child => { if (child.isMesh) child.castShadow = true; });
            p2Race.group.add(c2);
            p2Race.group.position.x = p2Race.x;
            raceScene.add(p2Race.group); 
        }
    });

    if (loadedTrafficModels.length === 0) {
        const trafficFiles = ['suv.glb', 'taxi.glb', 'police.glb', 'truck.glb'];
        trafficFiles.forEach(file => {
            loader.load('/models/' + file, (gltf) => {
                const mesh = gltf.scene;
                mesh.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }});
                loadedTrafficModels.push(mesh);
            });
        });
    }
}

function handleCarGameOver(playerStr) {
    let p = playerStr === 'p1' ? p1Race : p2Race;
    if (p.dead) return;
    p.dead = true;
    
    let msgEl = document.getElementById(playerStr === 'p1' ? 'p1Msg' : 'p2Msg');
    if(msgEl) msgEl.style.display = 'block';

    if (isMultiplayerMode) {
        // İki oyunculuda ölen 3 saniye kaybolur
        if (p.group) p.group.visible = false;
        setTimeout(() => {
            p.dead = false;
            p.score = Math.max(0, p.score - 20); 
            document.getElementById(playerStr === 'p1' ? 'p1Score' : 'p2Score').innerText = p.score;
            if(msgEl) msgEl.style.display = 'none';
            p.x = playerStr === 'p1' ? -3 : 3;
            p.targetX = p.x;
            p.z = 0; 
            if (p.group) { p.group.position.set(p.x, 0, p.z); p.group.visible = true; }
        }, 3000);
    } else {
        // Tek Oyunculu Klasik Ölüm: Oyun Durur, 3 Saniye Sonra Sıfırlanır
        setTimeout(() => {
            traffic.forEach(t => raceScene.remove(t.mesh));
            traffic = [];
            p1Race.score = 0; 
            p1Race.x = 2; p1Race.targetX = 2;
            singlePlayerSpeed = 0.5;
            document.getElementById('p1Score').innerText = "0";
            if(msgEl) msgEl.style.display = 'none';
            p1Race.dead = false;
        }, 3000);
    }
}

function updateCarPhysics(pData, inputs, isP1) {
    if (pData.dead || !pData.group || !inputs) return;

    if (isMultiplayerMode) {
        // 2P Modunda araçlar Z ekseninde (ileri-geri) hafif hareket edebilir
        if (inputs.gas) pData.z -= 0.15;
        else if (inputs.brake) pData.z += 0.25;
        else {
            // Gaz bırakılınca yavaşça merkeze (Z=0) dön
            if (pData.z < 0) pData.z += 0.05;
            else if (pData.z > 0) pData.z -= 0.05;
        }
        if (pData.z < -6) pData.z = -6; 
        if (pData.z > 6) pData.z = 6;   
    } else {
        // 1P Modunda araç Z=0'da sabit kalır, hız yolun hızını değiştirir
        pData.z = 0; 
    }

    if (inputs.steering !== undefined) pData.targetX = inputs.steering * 7.5; 
    pData.x += (pData.targetX - pData.x) * 0.15; 
    
    if (pData.x < -7) pData.x = -7;
    if (pData.x > 7) pData.x = 7;

    pData.group.position.set(pData.x, 0, pData.z);
    pData.group.rotation.y = -(pData.targetX - pData.x) * 0.2;
    pData.group.rotation.z = -(pData.targetX - pData.x) * 0.1;
}

// ARABALARIN ÜST ÜSTE BİNMESİNİ ENGELLEYEN FONKSİYON
function isLaneClear(lanePos, minZDistance) {
    for (let i = 0; i < traffic.length; i++) {
        if (Math.abs(traffic[i].mesh.position.x - lanePos) < 0.5) {
            // Eğer aynı şeritteki bir araba henüz minZDistance kadar uzaklaşmadıysa dolu say
            if (traffic[i].mesh.position.z < -250 + minZDistance) return false;
        }
    }
    return true;
}

function animateRacing() {
    if (!currentMode.startsWith('racing')) return; 
    activeAnimFrame = requestAnimationFrame(animateRacing);

    // 1P Hız Kontrolü
    if (!isMultiplayerMode && !p1Race.dead && players.player1.active) {
        if (players.player1.inputs.gas) singlePlayerSpeed = Math.min(singlePlayerSpeed + 0.02, 1.8);
        else if (players.player1.inputs.brake) singlePlayerSpeed = Math.max(singlePlayerSpeed - 0.05, 0.2);
        else singlePlayerSpeed = Math.max(singlePlayerSpeed - 0.01, 0.4);
        
        const speedValEl = document.getElementById('speedVal');
        if(speedValEl) speedValEl.innerText = `HIZ: ${Math.floor(singlePlayerSpeed * 120)} KM/H`;
    }

    // Fizik Güncellemeleri
    let globalRoadSpeed = isMultiplayerMode ? 1.0 : (p1Race.dead ? 0 : singlePlayerSpeed);
    
    if (players.player1.active) updateCarPhysics(p1Race, players.player1.inputs, true);
    if (isMultiplayerMode && players.player2.active) updateCarPhysics(p2Race, players.player2.inputs, false);

    roadGrid.position.z += globalRoadSpeed;
    if (roadGrid.position.z > 20) roadGrid.position.z = 0;

    // TRAFİK ÜRETİMİ (GÜVENLİ)
    if (!p1Race.dead || (isMultiplayerMode && !p2Race.dead)) {
        if (loadedTrafficModels.length > 0 && Math.random() < 0.03) { // Biraz daha seyreltildi
            const lanePos = laneCenters[Math.floor(Math.random() * laneCenters.length)];
            
            // O şerit müsait mi diye kontrol et (Aralarında en az 40 birim fark olsun)
            if (isLaneClear(lanePos, 40)) {
                const isOpposite = lanePos < 0;
                const randomModel = loadedTrafficModels[Math.floor(Math.random() * loadedTrafficModels.length)].clone();
                if (isOpposite) randomModel.rotation.y = Math.PI; 
                randomModel.position.set(lanePos, 0, -250);
                raceScene.add(randomModel);
                
                // Karşıdan gelenler için hız düşürüldü (Füze olmaları engellendi)
                traffic.push({ 
                    mesh: randomModel, 
                    speed: isOpposite ? (0.2 + Math.random() * 0.2) : (0.1 + Math.random() * 0.1), 
                    isOpposite: isOpposite, 
                    passedP1: false, passedP2: false 
                });
            }
        }
    }

    const colW = 2.0, colL = 4.2; // Hitbox milimetrik ayarlandı

    for (let i = traffic.length - 1; i >= 0; i--) {
        const t = traffic[i];
        
        // Hız formülü düzeltildi
        if (isMultiplayerMode) {
            t.mesh.position.z += (globalRoadSpeed + t.speed) * (t.isOpposite ? 1.5 : 0.5);
        } else {
            // 1P Modunda yola ve bize uyumlu geliş
            t.mesh.position.z += t.isOpposite ? (globalRoadSpeed + t.speed) : (globalRoadSpeed - t.speed); 
        }

        if (players.player1.active && !p1Race.dead) {
            let dx1 = Math.abs(t.mesh.position.x - p1Race.x);
            let dz1 = Math.abs(t.mesh.position.z - p1Race.z);
            if (dx1 < colW && dz1 < colL) handleCarGameOver('p1');

            if (t.mesh.position.z > p1Race.z + 5 && !t.passedP1) {
                p1Race.score += t.isOpposite ? 20 : 10;
                document.getElementById('p1Score').innerText = p1Race.score;
                t.passedP1 = true;
            }
        }

        if (isMultiplayerMode && players.player2.active && !p2Race.dead) {
            let dx2 = Math.abs(t.mesh.position.x - p2Race.x);
            let dz2 = Math.abs(t.mesh.position.z - p2Race.z);
            if (dx2 < colW && dz2 < colL) handleCarGameOver('p2');

            if (t.mesh.position.z > p2Race.z + 5 && !t.passedP2) {
                p2Race.score += t.isOpposite ? 20 : 10;
                document.getElementById('p2Score').innerText = p2Race.score;
                t.passedP2 = true;
            }
        }

        if (t.mesh.position.z > 20) {
            raceScene.remove(t.mesh);
            traffic.splice(i, 1);
        }
    }

    raceRenderer.render(raceScene, raceCamera);
}


// ==========================================
// 3. UÇAK OYUNU MOTORU (1P ve 2P Uyumlu)
// ==========================================
let flightCtx;
let bgImg = new Image(), groundImg = new Image(), rockTopImg = new Image(), rockBottomImg = new Image(), starImg = new Image(), planeImg = new Image();
planeImg.src = '/assets/planeBlue1.png';
bgImg.src = '/assets/background.png'; groundImg.src = '/assets/groundDirt.png';
rockTopImg.src = '/assets/rockDown.png'; rockBottomImg.src = '/assets/rockSnow.png'; starImg.src = '/assets/starGold.png';

let flightSpeed = 4, gravity = 0.4, bgX = 0, groundX = 0, pipes = [], frames = 0;

let p1Flight = { y: 0, vel: 0, score: 0, dead: false, color: '#ffffff', name: 'SKOR' };
let p2Flight = { y: 0, vel: 0, score: 0, dead: false, color: '#ff3366', name: 'P2' };

function initFlightGame() {
    flightDiv.width = window.innerWidth;
    flightDiv.height = window.innerHeight;
    flightCtx = flightDiv.getContext('2d');

    if (isMultiplayerMode) {
        p1Flight = { y: flightDiv.height / 2 - 50, vel: 0, score: 0, dead: false, color: '#00ffcc', name: 'P1' };
        p2Flight = { y: flightDiv.height / 2 + 50, vel: 0, score: 0, dead: false, color: '#ff3366', name: 'P2' };
    } else {
        p1Flight = { y: flightDiv.height / 2, vel: 0, score: 0, dead: false, color: '#ffffff', name: 'SKOR' };
    }
    
    pipes = []; frames = 0; bgX = 0; groundX = 0;
    animateFlight();
}

function handleFlightDeath(playerStr) {
    let p = playerStr === 'p1' ? p1Flight : p2Flight;
    if(p.dead) return;
    p.dead = true;
    
    if (isMultiplayerMode) {
        setTimeout(() => {
            p.dead = false; p.y = flightDiv.height / 2; p.vel = 0; p.score = Math.max(0, p.score - 10);
        }, 2000);
    } else {
        // 1P Oyun Sonu
        setTimeout(() => {
            pipes = []; frames = 0; p.dead = false; p.y = flightDiv.height / 2; p.vel = 0; p.score = 0;
        }, 2000);
    }
}

function animateFlight() {
    if (!currentMode.startsWith('flight')) return;
    activeAnimFrame = requestAnimationFrame(animateFlight);

    bgX -= flightSpeed * 0.3;
    if (bgX <= -flightDiv.width) bgX = 0;
    flightCtx.drawImage(bgImg, bgX, 0, flightDiv.width, flightDiv.height);
    flightCtx.drawImage(bgImg, bgX + flightDiv.width, 0, flightDiv.width, flightDiv.height);

    if (!p1Flight.dead || (isMultiplayerMode && !p2Flight.dead)) {
        frames++;
        if (frames % 100 === 0) { 
            let gap = 200, minRockHeight = 100;
            let maxRockHeight = flightDiv.height - 100 - gap - minRockHeight;
            let topRockHeight = Math.floor(Math.random() * maxRockHeight) + minRockHeight;

            pipes.push({
                x: flightDiv.width, top: topRockHeight, bottom: topRockHeight + gap, width: 70,
                passedP1: false, passedP2: false, hasStar: Math.random() > 0.3, starCollected: false
            });
        }
    }

    let planeRadius = 30; 
    let p1X = isMultiplayerMode ? flightDiv.width / 3 : flightDiv.width / 4;
    let p2X = flightDiv.width / 3 - 50; 

    if (players.player1.active && !p1Flight.dead) {
        if (players.player1.inputs.fire) { p1Flight.vel = -7; players.player1.inputs.fire = false; }
        p1Flight.vel += gravity; p1Flight.y += p1Flight.vel;
        if (p1Flight.y + 30 >= flightDiv.height - 100 || p1Flight.y - 30 <= 0) handleFlightDeath('p1');
    }
    if (isMultiplayerMode && players.player2.active && !p2Flight.dead) {
        if (players.player2.inputs.fire) { p2Flight.vel = -7; players.player2.inputs.fire = false; }
        p2Flight.vel += gravity; p2Flight.y += p2Flight.vel;
        if (p2Flight.y + 30 >= flightDiv.height - 100 || p2Flight.y - 30 <= 0) handleFlightDeath('p2');
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
        let p = pipes[i];
        p.x -= flightSpeed;

        flightCtx.drawImage(rockTopImg, p.x, 0, p.width, p.top);
        flightCtx.drawImage(rockBottomImg, p.x, p.bottom, p.width, flightDiv.height - p.bottom);

        if (p.hasStar && !p.starCollected) {
            let sX = p.x + p.width / 2 - 25, sY = p.top + (p.bottom - p.top) / 2 - 25;
            flightCtx.drawImage(starImg, sX, sY, 50, 50);

            if (players.player1.active && !p1Flight.dead && p1X+planeRadius>sX && p1X-planeRadius<sX+50 && p1Flight.y+planeRadius>sY && p1Flight.y-planeRadius<sY+50) {
                p.starCollected = true; p1Flight.score += 5; 
            } else if (isMultiplayerMode && players.player2.active && !p2Flight.dead && p2X+planeRadius>sX && p2X-planeRadius<sX+50 && p2Flight.y+planeRadius>sY && p2Flight.y-planeRadius<sY+50) {
                p.starCollected = true; p2Flight.score += 5;
            }
        }

        if (players.player1.active && !p1Flight.dead && p1X+planeRadius > p.x && p1X-planeRadius < p.x+p.width) {
            if (p1Flight.y-planeRadius < p.top || p1Flight.y+planeRadius > p.bottom) handleFlightDeath('p1');
        }
        if (isMultiplayerMode && players.player2.active && !p2Flight.dead && p2X+planeRadius > p.x && p2X-planeRadius < p.x+p.width) {
            if (p2Flight.y-planeRadius < p.top || p2Flight.y+planeRadius > p.bottom) handleFlightDeath('p2');
        }

        if (players.player1.active && !p1Flight.dead && p.x + p.width < p1X && !p.passedP1) { p1Flight.score += 1; p.passedP1 = true; }
        if (isMultiplayerMode && players.player2.active && !p2Flight.dead && p.x + p.width < p2X && !p.passedP2) { p2Flight.score += 1; p.passedP2 = true; }

        if (p.x + p.width < 0) pipes.splice(i, 1);
    }

    groundX -= flightSpeed;
    if (groundX <= -flightDiv.width) groundX = 0;
    flightCtx.drawImage(groundImg, groundX, flightDiv.height - 100, flightDiv.width, 100);
    flightCtx.drawImage(groundImg, groundX + flightDiv.width, flightDiv.height - 100, flightDiv.width, 100);

    function drawPlane(px, py, vel, isDead, color, name) {
        if(isDead) return;
        flightCtx.save();
        flightCtx.translate(px, py);
        flightCtx.rotate(Math.min(vel * 0.05, 0.5)); 
        flightCtx.drawImage(planeImg, -40, -40, 80, 80);
        if (isMultiplayerMode) {
            flightCtx.fillStyle = color;
            flightCtx.font = 'bold 20px Arial';
            flightCtx.fillText(name, -10, -50);
        }
        flightCtx.restore();
    }

    if (players.player1.active) drawPlane(p1X, p1Flight.y, p1Flight.vel, p1Flight.dead, p1Flight.color, p1Flight.name);
    if (isMultiplayerMode && players.player2.active) drawPlane(p2X, p2Flight.y, p2Flight.vel, p2Flight.dead, p2Flight.color, p2Flight.name);

    flightCtx.fillStyle = p1Flight.color;
    flightCtx.font = 'bold 40px Arial';
    flightCtx.lineWidth = 3;
    flightCtx.strokeStyle = 'black';
    
    if (isMultiplayerMode) {
        flightCtx.fillText(`P1: ${p1Flight.score}`, 50, 50);
        if (players.player2.active) {
            flightCtx.fillStyle = p2Flight.color;
            flightCtx.fillText(`P2: ${p2Flight.score}`, flightDiv.width - 150, 50);
        }
    } else {
        flightCtx.textAlign = 'center';
        flightCtx.fillText(`${p1Flight.score}`, flightDiv.width / 2, 80);
        flightCtx.strokeText(`${p1Flight.score}`, flightDiv.width / 2, 80);
        flightCtx.textAlign = 'left';
        
        if (p1Flight.dead) {
            flightCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            flightCtx.fillRect(0, 0, flightDiv.width, flightDiv.height);
            flightCtx.fillStyle = '#ff4444';
            flightCtx.textAlign = 'center';
            flightCtx.fillText("ÇAKILDIN!", flightDiv.width / 2, flightDiv.height / 2);
            flightCtx.textAlign = 'left';
        }
    }
}


// ==========================================
// 4. FPS NİŞANCI MOTORU
// ==========================================
function initShooterGame() {
    shooterDiv.innerHTML = `
        <div style="width:100vw; height:100vh; background:#121212; color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <h1 style="font-size: 50px;">FPS NİŞANCI (2 KİŞİLİK)</h1>
            <p style="color:#aaa;">Hedefleri vurmak için telefonu hareket ettir.</p>
            <h2 id="fpsData1" style="color:#00ffcc;">P1 Bekleniyor...</h2>
            <h2 id="fpsData2" style="color:#ff3366;">P2 Bekleniyor...</h2>
        </div>
    `;
    animateShooter();
}

function animateShooter() {
    if (currentMode !== 'shooter') return;
    activeAnimFrame = requestAnimationFrame(animateShooter);

    if (players.player1.active) {
        document.getElementById('fpsData1').innerText = `P1 - JoyX: ${players.player1.inputs.joyX?.toFixed(2)} | JoyY: ${players.player1.inputs.joyY?.toFixed(2)} | Ateş: ${players.player1.inputs.fire ? 'EVET' : 'HAYIR'}`;
    }
    if (players.player2.active) {
        document.getElementById('fpsData2').innerText = `P2 - JoyX: ${players.player2.inputs.joyX?.toFixed(2)} | JoyY: ${players.player2.inputs.joyY?.toFixed(2)} | Ateş: ${players.player2.inputs.fire ? 'EVET' : 'HAYIR'}`;
    }
}

// ==========================================
// EKRAN BOYUTU DEĞİŞİMİ
// ==========================================
window.addEventListener('resize', () => {
    if (currentMode.startsWith('racing') && raceRenderer) {
        raceCamera.aspect = window.innerWidth / window.innerHeight;
        raceCamera.updateProjectionMatrix();
        raceRenderer.setSize(window.innerWidth, window.innerHeight);
    } else if (currentMode.startsWith('flight') && flightDiv) {
        flightDiv.width = window.innerWidth;
        flightDiv.height = window.innerHeight;
    }
});