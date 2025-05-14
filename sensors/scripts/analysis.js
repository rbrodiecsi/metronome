// analysis.js

// computes the vector magnitude of accel
export function computeResultant({ t, x, y, z }) {
    const mag = Math.sqrt(x * x + y * y + z * z);
    return { t, mag };
}

let gEst = { x:0, y:0, z:0 };
const α = 0.98;  // how much history to hold

export function updateGravity(raw) {
    // raw = { x, y, z }
    gEst.x = α*gEst.x + (1-α)*raw.x;
    gEst.y = α*gEst.y + (1-α)*raw.y;
    gEst.z = α*gEst.z + (1-α)*raw.z;
    // normalize so gEst is a unit vector
    const mag = Math.hypot(gEst.x, gEst.y, gEst.z);
    gEst.x /= mag; gEst.y /= mag; gEst.z /= mag;
    return gEst;
}

export function projectToHorizontal(raw) {
    const g = gEst;  // from updateGravity
    const dot = raw.x*g.x + raw.y*g.y + raw.z*g.z;
    return {
        x: raw.x - dot*g.x,
        y: raw.y - dot*g.y,
        z: raw.z - dot*g.z
    };
}

// simple 1-D Kalman Filter for velocity
export class KalmanFilter1D {
    /**
     * @param {object} opts
     * @param {number} opts.dt  time step (s)
     * @param {number} opts.R   measurement variance (gps)
     * @param {number} opts.Q   process noise variance
     */
    constructor({ dt = 0.016, R = 1, Q = 0.1 } = {}) {
        this.dt = dt;
        this.R  = R;      // how noisy GPS vel is
        this.Q  = Q;      // how noisy accel integration is
        this.v  = 0;      // state: estimated velocity
        this.P  = 1;      // state covariance
    }

    // call on every accel sample (a in m/s²)
    predict(a) {
        // state prediction
        this.v += a * this.dt;
        // covariance prediction
        this.P += this.Q;
    }

    // call whenever you have a GPS velocity measurement
    update(z) {
        // Kalman gain
        const K = this.P / (this.P + this.R);
        // state correction
        this.v = this.v + K * (z - this.v);
        // covariance update
        this.P = (1 - K) * this.P;
    }

    get velocity() {
        return this.v;
    }
}

// CSV download remains unchanged
export function downloadCSV(samples) {
    const header = 'timestamp,x,y,z,resultant,velocity\n';
    const rows = samples.map(s => {
        const { t, x, y, z, v } = s;
        const mag = Math.sqrt(x*x + y*y + z*z).toFixed(3);
        return `${new Date(t).toISOString()},${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)},${mag},${v.toFixed(3)}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `accel_fused_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
