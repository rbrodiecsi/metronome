// analysis.js
// computeResultant: turns {t, x, y, z} → {t, mag}
export function computeResultant({ t, x, y, z }) {
    const mag = Math.sqrt(x * x + y * y + z * z);
    return { t, mag };
}

// downloadCSV: takes an array of samples and triggers CSV download
export function downloadCSV(samples) {
    const header = 'timestamp,x,y,z,resultant\n';
    const rows = samples.map(s => {
        const { t, x, y, z } = s;
        const mag = Math.sqrt(x * x + y * y + z * z).toFixed(3);
        return `${new Date(t).toISOString()},${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)},${mag}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `accel_data_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
