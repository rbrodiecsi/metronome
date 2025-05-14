// analysis.js

// computes the vector magnitude of accel
export function computeResultant({ t, x, y, z }) {
    const mag = Math.sqrt(x * x + y * y + z * z);
    return { t, mag };
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
