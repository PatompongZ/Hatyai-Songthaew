// --- 1. การตั้งค่า Firebase (เชื่อมต่อระบบออนไลน์) ---
const firebaseConfig = {
    apiKey: "AIzaSyBqwqRqymjQOS-1L8wJG3Fk4XX8dTcDprU",
    authDomain: "hatyai-songthaew.firebaseapp.com",
    databaseURL: "https://hatyai-songthaew-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "hatyai-songthaew",
    storageBucket: "hatyai-songthaew.firebasestorage.app",
    messagingSenderId: "478252834279",
    appId: "1:478252834279:web:755c877c35240691993142",
    measurementId: "G-06M5HVW52V"
};

const myUserId = "user_" + Math.random().toString(36).substr(2, 5);
let db = null;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
} catch (e) {
    console.error("Firebase Error:", e);
}

// --- 2. Data เส้นทางรถสองแถวหาดใหญ่ (ข้อมูลอัปเดตล่าสุด) ---
const routesData = [
    {
        id: 'white-bk',
        name: 'สายสีขาว (บางกล่ำ)',
        desc: 'บางกล่ำ – บิ๊กซี – เขต 8 – ขนส่ง – แม็คโคร',
        color: '#999', fare: '10-20 บาท', icon: '⚪',
        stops: ['บางกล่ำ', 'บิ๊กซี', 'เขต 8', 'กิมหยง', 'หน้าหอ', 'มอ.', 'ขนส่ง', 'แม็คโคร'],
        points: [[7.0850, 100.4150], [7.0435, 100.4755], [7.0255, 100.4560], [7.0165, 100.4715], [7.0120, 100.4735], [7.0115, 100.4912], [7.0012, 100.4851], [6.9945, 100.4855]]
    },
    {
        id: 'blue-ap',
        name: 'สายสีฟ้า (สนามบิน)',
        desc: 'สนามบิน – หาดใหญ่ใน – กิมหยง – บิ๊กซี – มอ. – ขนส่ง',
        color: '#5AC8FA', fare: '30 บาท', icon: '✈️',
        stops: ['สนามบิน', 'ญ.ร.ส.', 'หาดใหญ่ใน', 'กิมหยง', 'ญ.ว.', 'บิ๊กซี', 'มอ.', 'ขนส่ง'],
        points: [[6.9333, 100.3951], [6.9550, 100.4250], [7.0110, 100.4500], [7.0165, 100.4715], [7.0195, 100.4755], [7.0435, 100.4755], [7.0115, 100.4912], [7.0012, 100.4851]]
    },
    {
        id: 'red-km',
        name: 'สายสีแดง (เกาะหมี)',
        desc: 'เกาะหมี – เทคนิค – หน้าค่าย – ญ.ว. – กิมหยง – ญ.ส.',
        color: '#FF3B30', fare: '10-15 บาท', icon: '🔴',
        stops: ['เกาะหมี', 'เทคนิค', 'หน้าค่าย', 'บิ๊กซี', 'ญ.ว.', 'กิมหยง', 'ศรีภูวนารถ'],
        points: [[7.0650, 100.5050], [7.0520, 100.4960], [7.0250, 100.4935], [7.0435, 100.4755], [7.0195, 100.4755], [7.0165, 100.4715], [7.0020, 100.4780]]
    },
    {
        id: 'green-sk',
        name: 'สายสีเขียว (หาดใหญ่-สงขลา)',
        desc: 'หอนาฬิกา – น้ำพุ – ห้าแยก – สงขลา',
        color: '#34C759', fare: '34 บาท', icon: '🟢',
        stops: ['หอนาฬิกาหาดใหญ่', 'วงเวียนน้ำพุ', 'ห้าแยกเกาะยอ', 'สงขลา (เมือง)'],
        points: [[7.0120, 100.4735], [7.0145, 100.4777], [7.0850, 100.5250], [7.1950, 100.5950]]
    }
];

const userPos = [7.0130, 100.4730];
let map, activeMarker, activePolyline, userMarker, simulationTimeout;
let fullRoadPath = [];
let currentStep = 0;
let userRole = 'passenger';
let isPinning = false;
let pinningType = 'destination';
let availableSeats = 12;
let passengerCount = 0;
let totalRevenue = 0;

let pickupMarker = null;
let destinationMarker = null;
let otherMarkers = {};
let ghostBuses = [];

// --- 3. Role Systems & Firebase Sync ---
function setRole(role) {
    userRole = role;
    document.getElementById('role-overlay').style.display = 'none';

    if (role === 'driver') {
        document.getElementById('role-text').innerText = '🔔 โหมดคนขับ : ตำแหน่งของคุณจะโชว์บนแผนที่ผู้โดยสาร';
        document.getElementById('passenger-actions').classList.add('hidden');
        document.getElementById('driver-dashboard').classList.remove('hidden');
        if (db) {
            db.ref('sync/seats').set(12);
            db.ref('sync/checkins').set(0);
        }
    } else {
        document.getElementById('role-text').innerText = '📍 โหมดผู้โดยสาร : คุณจะเห็นรถสองแถวที่ว่างและสถานี';
        document.getElementById('passenger-actions').classList.remove('hidden');
        document.getElementById('driver-dashboard').classList.add('hidden');
    }
    if (db) listenToFirebase();
    spawnGhostBuses();
}

function listenToFirebase() {
    db.ref('sync/bell').on('value', (snap) => {
        if (snap.val()?.active && userRole === 'driver') showDriverNotif(`🔔 มีคนกดกริ่ง!`, 'var(--danger)');
    });
    db.ref('sync/sos').on('value', (snap) => {
        if (snap.val()?.active) {
            showDriverNotif(`🚨 SOS แจ้งเหตุ!`, '#000');
            if (userRole === 'passenger') alert('🚨 แจ้งเหตุ SOS บนรถคันนี้!');
        }
    });

    db.ref('live/drivers').on('value', (snap) => {
        const data = snap.val();
        for (let id in data) if (id !== myUserId) updateOtherMarker(id, data[id], '🛺');
    });

    db.ref('sync/checkins').on('value', (snap) => {
        passengerCount = snap.val() || 0;
        totalRevenue = passengerCount * 15; // สมมติค่าเฉลี่ย 15 บาท
        if (userRole === 'driver') {
            document.getElementById('driver-passenger-count').innerText = passengerCount + " คน";
            document.getElementById('driver-revenue').innerText = totalRevenue + " บาท";
        }
    });

    db.ref('sync/seats').on('value', (snap) => {
        availableSeats = snap.val() || 0;
        const el = document.getElementById('display-seats');
        if (el) {
            el.innerText = `${availableSeats} ที่นั่ง`;
            el.style.color = availableSeats > 0 ? 'var(--success)' : 'var(--danger)';
        }
    });

    db.ref('sync/pickup').on('value', (snap) => {
        if (snap.val()?.lat) updateMarker('pickup', snap.val().lat, snap.val().lng, "🚕");
    });
    db.ref('sync/destination').on('value', (snap) => {
        if (snap.val()?.lat) updateMarker('destination', snap.val().lat, snap.val().lng, "📍");
    });
}

// จำลองรถคันอื่น (Ghost Buses)
function spawnGhostBuses() {
    ghostBuses.forEach(b => map.removeLayer(b.marker));
    ghostBuses = [];

    // สุ่มรถ 2 คันในสายที่ไม่ได้เลือก
    const otherRoutes = routesData.filter(r => !document.querySelector('.route-card.active') || r.id !== document.querySelector('.route-card.active').id);
    otherRoutes.slice(0, 2).forEach(route => {
        const icon = L.divIcon({
            html: `<div style="font-size: 20px; opacity: 0.7;">🛺</div>`,
            className: 'ghost-bus', iconSize: [30, 30]
        });
        const marker = L.marker(route.points[0], { icon: icon }).addTo(map);
        ghostBuses.push({ marker, points: route.points, step: 0 });
    });
    animateGhostBuses();
}

function animateGhostBuses() {
    ghostBuses.forEach(bus => {
        const nextStep = (bus.step + 1) % bus.points.length;
        bus.marker.setLatLng(bus.points[nextStep]);
        bus.step = nextStep;
    });
    setTimeout(animateGhostBuses, 3000);
}

function updateMarker(type, lat, lng, emoji) {
    let m = type === 'pickup' ? pickupMarker : destinationMarker;
    if (m) map.removeLayer(m);
    const icon = L.divIcon({
        html: `<div style="font-size: 30px; transform: translateY(-15px);">${emoji}</div>`,
        className: 'custom-pin', iconSize: [30, 30], iconAnchor: [15, 30]
    });
    const newM = L.marker([lat, lng], { icon: icon }).addTo(map);
    if (type === 'pickup') pickupMarker = newM; else destinationMarker = newM;
}

function updateOtherMarker(id, data, emoji) {
    if (otherMarkers[id]) {
        otherMarkers[id].setLatLng([data.lat, data.lng]);
    } else {
        const icon = L.divIcon({
            html: `<div style="font-size: 24px;">${emoji}</div>`,
            className: 'other-marker', iconSize: [30, 30]
        });
        otherMarkers[id] = L.marker([data.lat, data.lng], { icon: icon }).addTo(map);
    }
}

function showDriverNotif(msg, color) {
    const n = document.getElementById('driver-notif');
    n.style.display = 'block'; n.style.background = color;
    n.innerHTML = `${msg} <button onclick="dismissNotif()" style="margin-left:10px; border:none; background:white; border-radius:10px; padding:2px 10px; color:${color};">ตกลง</button>`;
}

function dismissNotif() {
    if (db) { db.ref('sync/bell').set({ active: false }); db.ref('sync/sos').set({ active: false }); }
    document.getElementById('driver-notif').style.display = 'none';
}

function ringBell() { if (db && userRole === 'passenger') db.ref('sync/bell').set({ active: true, time: Date.now() }); alert('🔔 กดกริ่งแล้ว'); }

function checkIn() {
    if (availableSeats > 0 && userRole === 'passenger') {
        db.ref('sync/seats').set(availableSeats - 1);
        db.ref('sync/checkins').set(passengerCount + 1);
        alert('✅ เช็คอินสำเร็จ!');
    }
}

function triggerSOS() { if (confirm('🚨 ส่ง SOS?')) db.ref('sync/sos').set({ active: true, time: Date.now() }); }

function startPinning(type) {
    isPinning = true; pinningType = type;
    document.getElementById('pin-instruction').style.display = 'block';
    map.getContainer().style.cursor = 'crosshair';
}

function onMapClick(e) {
    if (!isPinning) return;
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (db) {
        const path = pinningType === 'pickup' ? 'sync/pickup' : 'sync/destination';
        db.ref(path).set({ lat, lng, time: Date.now() });
    }

    if (pinningType === 'pickup') {
        findAndDispatchBus(lat, lng);
        // Step Flow: หลังจากปักหมุดรับแล้ว ให้แสดงปุ่มปักหมุดลงทันที
        const dropButton = document.getElementById('pin-btn');
        const pickButton = document.getElementById('pickup-btn');
        if (dropButton) dropButton.classList.remove('hidden');
        if (pickButton) {
            pickButton.style.opacity = '0.5';
            pickButton.innerText = '✅ ปักจุดรับแล้ว';
        }
    }

    isPinning = false;
    document.getElementById('pin-instruction').style.display = 'none';
    map.getContainer().style.cursor = '';

    const msg = pinningType === 'pickup'
        ? '🚕 ปักจุดรับสำเร็จ! ตอนนี้คุณสามารถเลือก "ปักจุดลงรถ" ได้ต่อเลย'
        : '📍 ปักจุดลงสำเร็จ! ขอให้เดินทางโดยสวัสดิภาพ';
    alert(msg);
}

function findAndDispatchBus(pickupLat, pickupLng) {
    let nearestRoute = null;
    let minDistance = Infinity;

    // หาว่าจุดที่ปักรับเครื่องอยู่ใกล้เส้นทางสายไหนที่สุด
    routesData.forEach(route => {
        route.points.forEach(point => {
            const dist = Math.sqrt(Math.pow(point[0] - pickupLat, 2) + Math.pow(point[1] - pickupLng, 2));
            if (dist < minDistance) {
                minDistance = dist;
                nearestRoute = route;
            }
        });
    });

    if (nearestRoute) {
        alert(`🚕 ค้นพบสายรถที่ใกล้ที่สุด: ${nearestRoute.name}\nกำลังส่งรถไปรับคุณตามเส้นทาง!`);
        // ถ้าเราเป็นคนขับ หรือเป็น Demo ให้ปล่อยรถสายนี้ออกมาวิ่งทันที
        selectAndCalculateRoute(nearestRoute);
    }
}

// --- 4. Map Logic ---
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([7.0112, 100.4762], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
    map.on('click', onMapClick);
    renderRouteList();
}

function renderRouteList() {
    const list = document.getElementById('route-list');
    routesData.forEach(route => {
        const card = document.createElement('div');
        card.className = 'route-card';
        card.onclick = (e) => selectAndCalculateRoute(route, e);
        card.innerHTML = `<div class="route-icon" style="background: ${route.color}">${route.icon}</div><div class="route-info"><div class="route-name">${route.name}</div><div class="route-desc">${route.desc}</div></div>`;
        list.appendChild(card);
    });
}

function renderTimeline(stops) {
    const container = document.getElementById('route-timeline-container');
    const timeline = document.getElementById('timeline');
    container.classList.remove('hidden');
    timeline.innerHTML = stops.map((s, i) => `<div class="timeline-item" id="stop-${i}">${s}</div>`).join('');
}

async function selectAndCalculateRoute(route, event) {
    if (activeMarker) map.removeLayer(activeMarker);
    if (activePolyline) map.removeLayer(activePolyline);
    if (simulationTimeout) clearTimeout(simulationTimeout);

    document.querySelectorAll('.route-card').forEach(c => c.classList.remove('active'));
    if (event) event.currentTarget.classList.add('active');

    renderTimeline(route.stops);

    const coords = route.points.map(p => `${p[1]},${p[0]}`).join(';');
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
    const data = await res.json();
    fullRoadPath = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    currentStep = 0;

    activePolyline = L.polyline(fullRoadPath, { color: route.color, weight: 8, opacity: 0.6 }).addTo(map);
    const truckIcon = L.divIcon({
        html: `<div id="moving-truck" style="font-size: 26px;">🛺</div>`,
        className: 'truck-marker', iconSize: [40, 40], iconAnchor: [20, 20]
    });
    activeMarker = L.marker(fullRoadPath[0], { icon: truckIcon }).addTo(map);
    document.getElementById('info-card').classList.add('active');
    map.fitBounds(activePolyline.getBounds(), { padding: [50, 50] });
    runSimulation(route);
}

function runSimulation(route) {
    if (currentStep < fullRoadPath.length - 1) {
        const start = fullRoadPath[currentStep];
        const end = fullRoadPath[currentStep + 1];

        // อัปเดต Timeline ตามความก้าวหน้า
        const progress = currentStep / fullRoadPath.length;
        const stopIndex = Math.floor(progress * route.stops.length);
        document.querySelectorAll('.timeline-item').forEach((el, i) => {
            el.classList.remove('active', 'passed');
            if (i < stopIndex) el.classList.add('passed');
            else if (i === stopIndex) el.classList.add('active');
        });

        moveMarkerSmoothly(start, end, 600, () => {
            currentStep++;
            if (userRole === 'driver') db.ref('live/drivers/' + myUserId).set({ lat: end[0], lng: end[1] });

            document.getElementById('display-name').innerText = route.name;
            document.getElementById('display-eta').innerText = Math.ceil((fullRoadPath.length - currentStep) / 15) + " นาที";
            document.getElementById('display-status').innerText = route.stops[stopIndex] || "กำลังวิ่ง";
            document.getElementById('display-fare').innerText = route.fare;

            simulationTimeout = setTimeout(() => runSimulation(route), 30);
        });
    }
}

function moveMarkerSmoothly(start, end, duration, callback) {
    const startTime = performance.now();
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        activeMarker.setLatLng([start[0] + (end[0] - start[0]) * progress, start[1] + (end[1] - start[1]) * progress]);
        if (progress < 1) requestAnimationFrame(animate); else callback();
    }
    requestAnimationFrame(animate);
}

document.addEventListener('DOMContentLoaded', initMap);
