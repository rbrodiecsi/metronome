// main.js
import { computeResultant, downloadCSV } from './analysis.js';

const MAX_WINDOW_MS     = 5000;
const UPDATE_INTERVAL   = 100;   // ms
let buf                = [];     // raw {t,x,y,z}
let sensor, fallbackUnsub;
let updateTimer;

const startBtn    = document.getElementById('startBtn');
const stopBtn     = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');

// Initialize Plotly with one trace for resultant
function initChart() {
    const layout = {
        margin: { t: 30 },
        xaxis: {
            type: 'date',
            range: [Date.now() - MAX_WINDOW_MS, Date.now()],
            title: 'Time'
        },
        yaxis: { title: 'Resultant (m/s²)' }
    };
    const trace = { x: [], y: [], name: 'Resultant', mode: 'lines', line: { color: 'steelblue' } };
    Plotly.newPlot('chart', [trace], layout);
}

// Push latest resultant into the chart, slide window
function updatePlot() {
    const now = Date.now();
    // prune old samples
    buf = buf.filter(s => now - s.t <= MAX_WINDOW_MS);
    if (!buf.length) return;
    const latest = buf[buf.length - 1];
    const { t, mag } = computeResultant(latest);

    Plotly.extendTraces('chart', {
        x: [[new Date(t)]],
        y: [[mag]]
    }, [0]);

    Plotly.relayout('chart', {
        'xaxis.range': [now - MAX_WINDOW_MS, now]
    });
}

// Generic Sensor API → fallback to devicemotion
function startSensors() {
    if ('Accelerometer' in window) {
        try {
            sensor = new Accelerometer({ frequency: 60 });
            sensor.addEventListener('reading', () => {
                buf.push({ t: Date.now(), x: sensor.x, y: sensor.y, z: sensor.z });
            });
            sensor.addEventListener('error', e => {
                console.warn('Accel error', e.error);
                startFallback();
            });
            sensor.start();
            return;
        } catch (err) {
            console.warn('Accelerometer failed', err);
        }
    }
    startFallback();
}

function startFallback() {
    if (!('DeviceMotionEvent' in window)) {
        alert('No accelerometer support in this browser.');
        return;
    }
    const handler = ev => {
        const a = ev.accelerationIncludingGravity || ev.acceleration;
        if (a) buf.push({ t: Date.now(), x: a.x, y: a.y, z: a.z });
    };
    // iOS 13+ permission flow
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(p => {
                if (p === 'granted') {
                    window.addEventListener('devicemotion', handler);
                    fallbackUnsub = () => window.removeEventListener('devicemotion', handler);
                } else {
                    alert('Permission denied');
                }
            })
            .catch(console.error);
    } else {
        window.addEventListener('devicemotion', handler);
        fallbackUnsub = () => window.removeEventListener('devicemotion', handler);
    }
}

function stopSensors() {
    if (sensor) {
        try { sensor.stop(); } catch {}
        sensor = null;
    }
    if (fallbackUnsub) {
        fallbackUnsub();
        fallbackUnsub = null;
    }
}

// Button wiring
startBtn.addEventListener('click', () => {
    startBtn.disabled    = true;
    stopBtn.disabled     = false;
    downloadBtn.disabled = true;

    initChart();
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
    downloadCSV(buf);
});
