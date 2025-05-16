// UUID constants (short notation expanded)
const BASE   = '1517';
const MEAS_SVC = BASE+'2000-4947-11E9-8646-D663BD873D93';
const CTRL_CHAR = BASE+'2001-4947-11E9-8646-D663BD873D93';
const SHORT_CHAR= BASE+'2004-4947-11E9-8646-D663BD873D93';

// UI elements
const btnScan      = document.getElementById('btnScan');
const btnStopScan  = document.getElementById('btnStopScan');
const deviceList   = document.getElementById('deviceList');
const modeSelect   = document.getElementById('modeSelect');
const btnStart     = document.getElementById('btnStart');
const btnStop      = document.getElementById('btnStop');
const logEl        = document.getElementById('log');

let scanner, seen = new Map();
let chosenDevice, gattServer, measSvc, ctrlChar, dataChar, currentMode;

function log(msg){
    logEl.textContent += msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
}

// 1. Start scanning for advertisements
btnScan.addEventListener('click', async () => {
    if (!navigator.bluetooth || !navigator.bluetooth.requestLEScan) {
        return log('⚠️ Scanning API not supported in this browser.');
    }
    try {
        scanner = await navigator.bluetooth.requestLEScan({
            filters: [
                { namePrefix: 'Movella DOT' },
                { manufacturerData: [{ companyIdentifier: 0x0886 }] }
            ],
            keepRepeatedDevices: false
        });
        navigator.bluetooth.addEventListener('advertisementreceived', onAdvertisement);
        btnScan.disabled     = true;
        btnStopScan.disabled = false;
        log('🔍 Scanning for DOT devices…');
    } catch (err) {
        log('❌ Scan failed: ' + err);
    }
});

// 2. Stop scanning
btnStopScan.addEventListener('click', () => {
    if (scanner) scanner.stop();
    navigator.bluetooth.removeEventListener('advertisementreceived', onAdvertisement);
    btnScan.disabled     = false;
    btnStopScan.disabled = true;
    log('🛑 Scanning stopped.');
});

// 3. Handle each advertisement
function onAdvertisement(event) {
    const id = event.device.id;
    if (seen.has(id)) return;
    seen.set(id, event.device);
    const li = document.createElement('li');
    li.textContent = event.device.name || `DOT (${id.slice(-5)})`;
    li.addEventListener('click', () => connectToDevice(event.device));
    deviceList.appendChild(li);
    log(`➕ Found ${li.textContent} (RSSI ${event.rssi})`);
}

// 4. Connect when a user clicks a listed device
async function connectToDevice(device) {
    chosenDevice = device;
    log(`🔗 Connecting to ${device.name}…`);
    try {
        gattServer = await device.gatt.connect();
        measSvc    = await gattServer.getPrimaryService(MEAS_SVC);
        ctrlChar   = await measSvc.getCharacteristic(CTRL_CHAR);
        log(`✅ Connected to ${device.name}`);
        modeSelect.disabled = false;
        btnStart.disabled   = false;
    } catch (err) {
        log('❌ Connection error: ' + err);
    }
}

// 5. Start/stop streaming (same as before)
btnStart.addEventListener('click', startStreaming);
btnStop .addEventListener('click', stopStreaming);

async function startStreaming() {
    try {
        currentMode = Number(modeSelect.value);
        dataChar    = await measSvc.getCharacteristic(SHORT_CHAR);
        await dataChar.startNotifications();
        dataChar.addEventListener('characteristicvaluechanged', handleData);
        await ctrlChar.writeValue(Uint8Array.from([1,1,currentMode]));
        log('▶️ Streaming…');
        btnStart.disabled   = true;
        btnStop.disabled    = false;
        modeSelect.disabled = true;
    } catch (err) {
        log('❌ ' + err);
    }
}

async function stopStreaming() {
    try {
        await ctrlChar.writeValue(Uint8Array.from([1,0,0]));
        await dataChar.stopNotifications();
        dataChar.removeEventListener('characteristicvaluechanged', handleData);
        log('⏹️ Stopped.');
        btnStart.disabled   = false;
        btnStop.disabled    = true;
        modeSelect.disabled = false;
    } catch (err) {
        log('❌ ' + err);
    }
}

function handleData(ev) {
    const dv = ev.target.value;
    const ts = dv.getUint32(0,true);
    const [x,y,z] = [dv.getFloat32(4,true), dv.getFloat32(8,true), dv.getFloat32(12,true)];
    log(`t=${ts}µs → [${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}]`);
}
