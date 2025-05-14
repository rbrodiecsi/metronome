// scripts/main.js
import { computeResultant, downloadCSV } from './analysis.js';

const MAX_WINDOW_MS     = 5000;
const UPDATE_INTERVAL   = 100;    // ms between batch plots
let buf                = [];      // raw {t,x,y,z}
let sensor, fallbackUnsub;
let updateTimer;
let lastPlotTime       = 0;       // timestamp of last batch

const startBtn    = document.getElementById('startBtn');
const stopBtn     = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');

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

function updatePlot() {
    const now = Date.now();

    // 1) prune out samples older than our window
    buf = buf.filter(s => now - s.t <= MAX_WINDOW_MS);

    // 2) grab only samples collected since lastPlotTime
    const newSamples = buf.filter(s => s.t > lastPlotTime);
    lastPlotTime = now;

    if (newSamples.length === 0) {
        // nothing new—still slide window so axis stays up to date
        Plotly.relayout('chart', {
            'xaxis.range': [ now - MAX_WINDOW_MS, now ]
        });
        return;
    }

    // 3) prepare arrays for Plotly
    const xs = newSamples.map(s => new Date(s.t));
    const ys = newSamples.map(s => computeResultant(s).mag);

    // 4) batch-extend all points in one call
    Plotly.extendTraces('chart', {
        x: [ xs ],
        y: [ ys ]
    }, [0]);

    // 5) slide the time window
    Plotly.relayout('chart', {
        'xaxis.range': [ now - MAX_WINDOW_MS, now ]
    });
}

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
            console.warn('Accelerometer ctor failed:', err);
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

startBtn.addEventListener('click', () => {
    startBtn.disabled    = true;
    stopBtn.disabled     = false;
    downloadBtn.disabled = true;

    initChart();
    startSensors();
    lastPlotTime = Date.now();  // reset batch pointer
    updateTimer  = setInterval(updatePlot, UPDATE_INTERVAL);
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
