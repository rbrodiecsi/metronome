// main.js
import { downloadCSV, KalmanFilter1D , updateGravity, projectToHorizontal } from './analysis.js';

const MAX_WINDOW_MS   = 5000;
const UPDATE_INTERVAL = 100;    // ms
let buf     = [];               // raw {t,x,y,z}
let velBuf  = [];               // fused {t, v}
let sensor, fallbackUnsub, updateTimer, lastPlotTime;
let kf;                         // our Kalman filter instance
let gpsWatcherId;
let lastGps = null;             // {lat, lon, ts}

const startBtn    = document.getElementById('startBtn');
const stopBtn     = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');

// 1) Initialize Plotly with two traces & dual y-axes
function initChart() {
    const accelTrace = {
        x: [], y: [], name: 'Accel Resultant',
        mode: 'lines', line: { color: 'steelblue' }
    };
    const velTrace = {
        x: [], y: [], name: 'Fused Velocity',
        mode: 'lines', line: { color: 'crimson' },
        yaxis: 'y2'
    };
    const layout = {
        margin: { t: 30 },
        xaxis: { type: 'date',
            range: [Date.now() - MAX_WINDOW_MS, Date.now()],
            title: 'Time' },
        yaxis: { title: 'Accel (m/s²)' },
        yaxis2: {
            title: 'Velocity (m/s)',
            overlaying: 'y',
            side: 'right'
        }
    };
    Plotly.newPlot('chart', [accelTrace, velTrace], layout);
}

// 2) Batch-plot all new samples in both buffers
function updatePlot() {
    const now = Date.now();

    // prune old
    buf    = buf.filter(s => now - s.t <= MAX_WINDOW_MS);
    velBuf = velBuf.filter(s => now - s.t <= MAX_WINDOW_MS);

    // fresh samples
    const newAcc = buf.filter(s => s.t > lastPlotTime);
    const newVel = velBuf.filter(s => s.t > lastPlotTime);
    lastPlotTime = now;

    if (newAcc.length || newVel.length) {
        const xsAcc = newAcc.map(s => new Date(s.t));
        const ysAcc = newAcc.map(s => computeResultant(s).mag);
        const xsVel = newVel.map(s => new Date(s.t));
        const ysVel = newVel.map(s => s.v);

        Plotly.extendTraces('chart', {
            x: [ xsAcc, xsVel ],
            y: [ ysAcc, ysVel ]
        }, [0, 1]);
    }

    // slide window
    Plotly.relayout('chart', {
        'xaxis.range': [now - MAX_WINDOW_MS, now]
    });
}

// 3) Sensor setup remains mostly the same, but we also call kf.predict & record vel
function startSensors() {
    kf = new KalmanFilter1D({
        dt: UPDATE_INTERVAL / 1000,
        R: 1,    // tune to your GPS noise
        Q: 0.1   // tune to your accel noise
    });

    const onReading = (x, y, z) => {
        const t   = Date.now();
        const raw = { x, y, z };

        // 1) Update our rolling gravity estimate
        updateGravity(raw);

        // 2) Project out the gravity component → horizontal accel
        const hor = projectToHorizontal(raw);

        // 3) Buffer the horizontal sample instead of the full vector
        buf.push({ t, x: hor.x, y: hor.y, z: hor.z });

        // 4) Use the magnitude of horizontal accel in your Kalman predict
        const horMag = Math.hypot(hor.x, hor.y, hor.z);
        kf.predict(horMag);

        // 5) Record the fused velocity, as before
        velBuf.push({ t, v: kf.velocity });
    };

    if ('Accelerometer' in window) {
        try {
            sensor = new Accelerometer({ frequency: 60 });
            sensor.addEventListener('reading', () => {
                onReading(sensor.x, sensor.y, sensor.z);
            });
            sensor.addEventListener('error', () => startFallback(onReading));
            sensor.start();
            return;
        } catch {
            startFallback(onReading);
        }
    } else {
        startFallback(onReading);
    }

    // also start GPS watcher
    if ('geolocation' in navigator) {
        gpsWatcherId = navigator.geolocation.watchPosition(pos => {
            const ts = pos.timestamp;

            // 1) Try the direct GPS speed first
            if (pos.coords.speed != null) {
                // Doppler‐derived speed in m/s
                kf.update(pos.coords.speed);
                velBuf.push({ t: ts, v: kf.velocity });

            } else if (lastGps) {
                // 2) Fallback to position‐difference
                const dt    = (ts - lastGps.ts) / 1000;                   // s
                const dist  = haversine(pos.coords.latitude,
                    pos.coords.longitude,
                    lastGps.lat, lastGps.lon);      // m
                const vGps  = dist / dt;                                  // m/s
                kf.update(vGps);
                velBuf.push({ t: ts, v: kf.velocity });
            }

            // 3) Update lastGps for next fallback
            lastGps = { lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                ts };
        }, console.error, { enableHighAccuracy: true, maximumAge: 1000 });
    }
}

// 4) Fallback handler for devicemotion
function startFallback(onReading) {
    if (!('DeviceMotionEvent' in window)) {
        alert('No accelerometer support');
        return;
    }
    const handler = ev => {
        const a = ev.accelerationIncludingGravity || ev.acceleration;
        if (a) onReading(a.x, a.y, a.z);
    };
    if (DeviceMotionEvent.requestPermission) {
        DeviceMotionEvent.requestPermission()
            .then(p => p === 'granted' && window.addEventListener('devicemotion', handler));
    } else {
        window.addEventListener('devicemotion', handler);
    }
    fallbackUnsub = () => window.removeEventListener('devicemotion', handler);
}

// 5) Stop everything
function stopSensors() {
    if (sensor) { sensor.stop(); sensor = null; }
    if (fallbackUnsub) { fallbackUnsub(); fallbackUnsub = null; }
    if (gpsWatcherId != null) {
        navigator.geolocation.clearWatch(gpsWatcherId);
        gpsWatcherId = null;
    }
}

// 6) Wire up UI
startBtn.addEventListener('click', () => {
    startBtn.disabled    = true;
    stopBtn.disabled     = false;
    downloadBtn.disabled = true;

    initChart();
    lastPlotTime = Date.now();
    updatePlot(); // initial
    startSensors();
    updateTimer = setInterval(updatePlot, UPDATE_INTERVAL);
});

stopBtn.addEventListener('click', () => {
    stopBtn.disabled     = true;
    startBtn.disabled    = false;
    downloadBtn.disabled = false;

    clearInterval(updateTimer);
    stopSensors();
});

downloadBtn.addEventListener('click', () => {
    // merge buffers and include velocity
    const merged = buf.map((s, i) => {
        // find closest vel sample by timestamp
        const v = (velBuf.find(vs => vs.t >= s.t) || { v: NaN }).v;
        return { ...s, v };
    });
    downloadCSV(merged);
});

// helper: haversine distance between two lat/lon in meters
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6_371_000;
    const toRad = n => n * Math.PI/180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 +
        Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*
        Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
