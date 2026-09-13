/**
 * AquaSentinel - Real-Time Multi-Channel Canvas Strip-Chart Oscilloscope
 *
 * Zero-dependency, high-performance HTML5 Canvas plotter for:
 *  - pH (0 to 14) with IS 10500 safe window (6.5 to 8.5)
 *  - TDS (0 to 2000 ppm) with 500 ppm desirable / 2000 ppm permissible limits
 *  - Turbidity (0 to 100 NTU) with 1.0 NTU limit
 */

class TelemetryChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // Buffer for 60 seconds of data (1 sample per 500ms = 120 points)
    this.maxPoints = 80;
    this.history = {
      ph: [],
      tds: [],
      turbidity: []
    };

    this.activeChannel = 'ALL'; // 'ALL', 'PH', 'TDS', 'TURB'

    // Resize handling
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.canvas.width = rect.width * (window.devicePixelRatio || 1);
      this.canvas.height = rect.height * (window.devicePixelRatio || 1);
      this.ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }
  }

  pushData(ph, tds, turbidity) {
    this.history.ph.push(ph);
    if (this.history.ph.length > this.maxPoints) this.history.ph.shift();

    this.history.tds.push(tds);
    if (this.history.tds.length > this.maxPoints) this.history.tds.shift();

    this.history.turbidity.push(turbidity);
    if (this.history.turbidity.length > this.maxPoints) this.history.turbidity.shift();

    this.render();
  }

  setFilter(channel) {
    this.activeChannel = channel;
    this.render();
  }

  render() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // Draw Dark Oscilloscope Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    const gridRows = 5;
    for (let i = 0; i <= gridRows; i++) {
      const y = (height / gridRows) * i;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(width - 10, y);
      ctx.stroke();
    }

    // Vertical time grid lines
    const gridCols = 8;
    for (let j = 0; j <= gridCols; j++) {
      const x = 40 + ((width - 50) / gridCols) * j;
      ctx.beginPath();
      ctx.moveTo(x, 10);
      ctx.lineTo(x, height - 20);
      ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '9px monospace';
    ctx.fillText('0s', width - 25, height - 6);
    ctx.fillText('-15s', width - (width - 50) * 0.25 - 20, height - 6);
    ctx.fillText('-30s', width - (width - 50) * 0.5 - 20, height - 6);
    ctx.fillText('-45s', 40, height - 6);

    const plotX = 45;
    const plotW = width - 60;
    const plotY = 15;
    const plotH = height - 40;

    // 1. Draw pH Channel (Green neon)
    if (this.activeChannel === 'ALL' || this.activeChannel === 'PH') {
      this.drawSeries(
        ctx,
        this.history.ph,
        0, 14,
        plotX, plotY, plotW, plotH,
        '#10b981',
        'pH',
        // Highlight safe band (6.5 to 8.5)
        { min: 6.5, max: 8.5, bandColor: 'rgba(16, 185, 129, 0.08)' }
      );
    }

    // 2. Draw TDS Channel (Cyan neon)
    if (this.activeChannel === 'ALL' || this.activeChannel === 'TDS') {
      this.drawSeries(
        ctx,
        this.history.tds,
        0, 2000,
        plotX, plotY, plotW, plotH,
        '#00f2fe',
        'TDS (ppm)',
        { min: 0, max: 500, bandColor: 'rgba(0, 242, 254, 0.05)' }
      );
    }

    // 3. Draw Turbidity Channel (Amber neon)
    if (this.activeChannel === 'ALL' || this.activeChannel === 'TURB') {
      this.drawSeries(
        ctx,
        this.history.turbidity,
        0, 120,
        plotX, plotY, plotW, plotH,
        '#f59e0b',
        'Turb (NTU)',
        { min: 0, max: 5.0, bandColor: 'rgba(245, 158, 11, 0.05)' }
      );
    }
  }

  drawSeries(ctx, data, minVal, maxVal, x0, y0, w, h, strokeColor, label, safeZone) {
    if (data.length < 2) return;

    // Draw Safe Zone Background Shading
    if (safeZone) {
      const ySafeMax = y0 + h - ((safeZone.max - minVal) / (maxVal - minVal)) * h;
      const ySafeMin = y0 + h - ((safeZone.min - minVal) / (maxVal - minVal)) * h;
      ctx.fillStyle = safeZone.bandColor;
      ctx.fillRect(x0, Math.min(ySafeMax, ySafeMin), w, Math.abs(ySafeMax - ySafeMin));

      // Dashed safe boundary line
      ctx.strokeStyle = strokeColor;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x0, ySafeMax);
      ctx.lineTo(x0 + w, ySafeMax);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Waveform
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const step = w / (this.maxPoints - 1);
    const offset = this.maxPoints - data.length;

    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      const clamped = Math.max(minVal, Math.min(maxVal, val));
      const normalized = (clamped - minVal) / (maxVal - minVal);
      const x = x0 + (offset + i) * step;
      const y = y0 + h - normalized * h;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Pulse dot at current live point
    const lastVal = data[data.length - 1];
    const lastNorm = (Math.max(minVal, Math.min(maxVal, lastVal)) - minVal) / (maxVal - minVal);
    const lastX = x0 + (offset + data.length - 1) * step;
    const lastY = y0 + h - lastNorm * h;

    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Small label tag
    ctx.fillStyle = strokeColor;
    ctx.font = '10px monospace';
    ctx.fillText(`${label}: ${lastVal}`, lastX - 55, lastY - 6);
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.TelemetryChart = TelemetryChart;
}
