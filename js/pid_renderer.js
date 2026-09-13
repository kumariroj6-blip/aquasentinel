/**
 * AquaSentinel - Piping & Instrumentation Diagram (P&ID) SVG Renderer
 *
 * Renders an animated industrial hydraulic schematic:
 *  - Raw Water Inlet & Storage Tank
 *  - Booster Pump & Solenoid Valves (SV1 to SV5)
 *  - Filter Columns: Pre-Strainer, Dual-Media Sand, Targeted Media, GAC Carbon
 *  - Clean Water Effluent Tank & Diverter/Recirculation Return Loop
 *  - Dynamic fluid flow animations using animated SVG strokes and glowing nodes
 */

class PIDRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.svg = null;
    this.initSvg();
  }

  initSvg() {
    if (!this.container) return;

    this.container.innerHTML = `
      <svg viewBox="0 0 1000 360" class="pid-svg" id="pidSvgElement" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Neon linear gradients for hydraulic flows -->
          <linearGradient id="flowGradActive" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#00f2fe" />
            <stop offset="50%" stop-color="#4facfe" />
            <stop offset="100%" stop-color="#00f2fe" />
          </linearGradient>

          <linearGradient id="flowGradRecirc" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ff0844" />
            <stop offset="100%" stop-color="#ffb199" />
          </linearGradient>

          <linearGradient id="tankWaterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#00c6ff" stop-opacity="0.8" />
            <stop offset="100%" stop-color="#0072ff" stop-opacity="0.9" />
          </linearGradient>

          <linearGradient id="cleanWaterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#00f5d4" stop-opacity="0.8" />
            <stop offset="100%" stop-color="#0575e6" stop-opacity="0.9" />
          </linearGradient>

          <linearGradient id="filterMediaGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#2c3e50" />
            <stop offset="100%" stop-color="#3498db" />
          </linearGradient>

          <linearGradient id="filterMediaGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#e67e22" />
            <stop offset="100%" stop-color="#d35400" />
          </linearGradient>

          <!-- Glow Filter for active pipes -->
          <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- Background grid pattern for engineering CAD look -->
        <g class="cad-grid" opacity="0.15">
          <line x1="0" y1="90" x2="1000" y2="90" stroke="#00f2fe" stroke-width="0.5" stroke-dasharray="4,4"/>
          <line x1="0" y1="180" x2="1000" y2="180" stroke="#00f2fe" stroke-width="0.5" stroke-dasharray="4,4"/>
          <line x1="0" y1="270" x2="1000" y2="270" stroke="#00f2fe" stroke-width="0.5" stroke-dasharray="4,4"/>
          <line x1="200" y1="0" x2="200" y2="360" stroke="#00f2fe" stroke-width="0.5" stroke-dasharray="4,4"/>
          <line x1="400" y1="0" x2="400" y2="360" stroke="#00f2fe" stroke-width="0.5" stroke-dasharray="4,4"/>
          <line x1="600" y1="0" x2="600" y2="360" stroke="#00f2fe" stroke-width="0.5" stroke-dasharray="4,4"/>
          <line x1="800" y1="0" x2="800" y2="360" stroke="#00f2fe" stroke-width="0.5" stroke-dasharray="4,4"/>
        </g>

        <!-- PIPING SYSTEM (Background inert pipes) -->
        <g id="basePipes" stroke="#1f2937" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <!-- Inlet to Stage 1 -->
          <path d="M 100 180 L 220 180" />
          <!-- Stage 1 to Stage 2 -->
          <path d="M 270 180 L 370 180" />
          <!-- Stage 2 to Stage 3 -->
          <path d="M 430 180 L 530 180" />
          <!-- Stage 3 to Stage 4 -->
          <path d="M 590 180 L 690 180" />
          <!-- Stage 4 to Diverter SV5 -->
          <path d="M 750 180 L 840 180" />
          <!-- SV5 to Clean Tank -->
          <path d="M 840 180 L 920 180" />
          <!-- SV5 Recirculation Return Loop (Bottom pipe back to Raw Tank) -->
          <path d="M 840 180 L 840 300 L 70 300 L 70 240" />
        </g>

        <!-- DYNAMIC ACTIVE FLOW PIPES (Animated pulses when active) -->
        <g id="activeFlows" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <!-- Flow 1: Raw Tank to Stage 1 (SV1) -->
          <path id="pipeRawToS1" d="M 100 180 L 220 180" stroke="url(#flowGradActive)" stroke-width="5" class="flow-pulse" />

          <!-- Flow 2: Stage 1 to Stage 2 (SV2) -->
          <path id="pipeS1ToS2" d="M 270 180 L 370 180" stroke="url(#flowGradActive)" stroke-width="5" class="flow-pulse" />

          <!-- Flow 3: Stage 2 to Stage 3 (SV3) -->
          <path id="pipeS2ToS3" d="M 430 180 L 530 180" stroke="url(#flowGradActive)" stroke-width="5" class="flow-pulse" />

          <!-- Flow 4: Stage 3 to Stage 4 (SV4) -->
          <path id="pipeS3ToS4" d="M 590 180 L 690 180" stroke="url(#flowGradActive)" stroke-width="5" class="flow-pulse" />

          <!-- Flow 5: Stage 4 to SV5 -->
          <path id="pipeS4ToSV5" d="M 750 180 L 840 180" stroke="url(#flowGradActive)" stroke-width="5" class="flow-pulse" />

          <!-- Flow 6: SV5 to Product Tank -->
          <path id="pipeSV5ToProduct" d="M 840 180 L 920 180" stroke="url(#flowGradActive)" stroke-width="5" class="flow-pulse" />

          <!-- Flow 7: Recirculation Return Loop -->
          <path id="pipeRecircReturn" d="M 840 180 L 840 300 L 70 300 L 70 240" stroke="url(#flowGradRecirc)" stroke-width="4" stroke-dasharray="6,6" class="flow-pulse-recirc" style="display: none;" />
        </g>

        <!-- RAW WATER INTAKE TANK -->
        <g id="rawTankGroup" transform="translate(30, 110)">
          <!-- Tank Outline -->
          <rect x="0" y="0" width="70" height="130" rx="8" fill="#111827" stroke="#374151" stroke-width="2"/>
          <!-- Dynamic Liquid Level -->
          <rect id="rawTankWater" x="4" y="25" width="62" height="101" rx="4" fill="url(#tankWaterGrad)" />
          <!-- Tank Label -->
          <text x="35" y="65" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle">RAW WATER</text>
          <text x="35" y="78" fill="#9ca3af" font-size="9" text-anchor="middle">SOURCE TANK</text>
          <text id="rawTankVolTxt" x="35" y="105" fill="#38bdf8" font-size="10" font-weight="600" text-anchor="middle">1000 L</text>
          <!-- Level Sensor indicator -->
          <circle cx="35" cy="15" r="4" fill="#10b981" />
        </g>

        <!-- STAGE 1: COARSE MESH STRAINER -->
        <g id="stage1Group" transform="translate(220, 130)">
          <rect x="0" y="0" width="50" height="100" rx="6" fill="#1f2937" stroke="#4b5563" stroke-width="2" id="s1Rect"/>
          <!-- Mesh pattern inside -->
          <line x1="8" y1="20" x2="42" y2="80" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="3,3"/>
          <line x1="8" y1="80" x2="42" y2="20" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="3,3"/>
          <rect x="15" y="35" width="20" height="30" fill="#374151" rx="2" />
          <text x="25" y="52" fill="#00f2fe" font-size="9" font-weight="700" text-anchor="middle">50μm</text>
          <text x="25" y="-10" fill="#e5e7eb" font-size="10" font-weight="700" text-anchor="middle">STAGE 1</text>
          <text x="25" y="115" fill="#9ca3af" font-size="9" text-anchor="middle">Strainer</text>
          <circle id="s1Led" cx="25" cy="5" r="3" fill="#10b981"/>
        </g>

        <!-- STAGE 2: DUAL-MEDIA SAND/ANTHRACITE BED -->
        <g id="stage2Group" transform="translate(370, 115)">
          <rect x="0" y="0" width="60" height="130" rx="8" fill="#111827" stroke="#4b5563" stroke-width="2" id="s2Rect"/>
          <!-- Anthracite Layer (dark gray) -->
          <rect x="5" y="25" width="50" height="35" fill="#374151" rx="2" opacity="0.9"/>
          <!-- Silica Sand Layer (golden tan) -->
          <rect x="5" y="62" width="50" height="40" fill="#b45309" rx="2" opacity="0.8"/>
          <!-- Gravel Support (dark) -->
          <rect x="5" y="104" width="50" height="20" fill="#1f2937" rx="2" opacity="0.9"/>
          <text x="30" y="-10" fill="#e5e7eb" font-size="10" font-weight="700" text-anchor="middle">STAGE 2</text>
          <text x="30" y="46" fill="#f3f4f6" font-size="8" font-weight="600" text-anchor="middle">ANTHRACITE</text>
          <text x="30" y="85" fill="#fef3c7" font-size="8" font-weight="600" text-anchor="middle">SILICA SAND</text>
          <text x="30" y="145" fill="#9ca3af" font-size="9" text-anchor="middle">Dual-Media</text>
          <circle id="s2Led" cx="30" cy="5" r="3" fill="#6b7280"/>
        </g>

        <!-- STAGE 3: TARGETED MEDIA REACTOR (Calcite / Alumina / Birm) -->
        <g id="stage3Group" transform="translate(530, 110)">
          <rect x="0" y="0" width="60" height="140" rx="8" fill="#111827" stroke="#4b5563" stroke-width="2" id="s3Rect"/>
          <!-- Specialized Media bed pattern -->
          <rect id="s3MediaFill" x="5" y="25" width="50" height="100" fill="url(#filterMediaGrad2)" rx="3" opacity="0.75"/>
          <text x="30" y="-10" fill="#e5e7eb" font-size="10" font-weight="700" text-anchor="middle">STAGE 3</text>
          <text id="s3Label1" x="30" y="60" fill="#ffffff" font-size="8" font-weight="700" text-anchor="middle">TARGETED</text>
          <text id="s3Label2" x="30" y="73" fill="#ffffff" font-size="8" font-weight="700" text-anchor="middle">MEDIA</text>
          <text id="s3Sublabel" x="30" y="100" fill="#fef08a" font-size="7" font-weight="600" text-anchor="middle">Al2O3 / Birm</text>
          <text x="30" y="155" fill="#9ca3af" font-size="9" text-anchor="middle">Chemical Adsorb</text>
          <circle id="s3Led" cx="30" cy="5" r="3" fill="#6b7280"/>
        </g>

        <!-- STAGE 4: GRANULAR ACTIVATED CARBON (GAC) + ULTRAFILTRATION -->
        <g id="stage4Group" transform="translate(690, 115)">
          <rect x="0" y="0" width="60" height="130" rx="8" fill="#111827" stroke="#4b5563" stroke-width="2" id="s4Rect"/>
          <!-- Carbon Pellets Layer -->
          <rect x="5" y="25" width="50" height="65" fill="#1e293b" rx="2" stroke="#475569" stroke-width="1"/>
          <!-- Ultrafiltration polishing barrier -->
          <rect x="5" y="92" width="50" height="30" fill="#0284c7" rx="2" opacity="0.75"/>
          <text x="30" y="-10" fill="#e5e7eb" font-size="10" font-weight="700" text-anchor="middle">STAGE 4</text>
          <text x="30" y="55" fill="#94a3b8" font-size="8" font-weight="700" text-anchor="middle">GAC CARBON</text>
          <text x="30" y="110" fill="#e0f2fe" font-size="8" font-weight="600" text-anchor="middle">UF MEMBRANE</text>
          <text x="30" y="145" fill="#9ca3af" font-size="9" text-anchor="middle">Polishing Bed</text>
          <circle id="s4Led" cx="30" cy="5" r="3" fill="#10b981"/>
        </g>

        <!-- SOLENOID VALVES (SV1 to SV5) -->
        <!-- SV1 (Inlet Solenoid) -->
        <g id="valveSV1" transform="translate(150, 165)">
          <polygon points="0,5 20,15 0,25" fill="#ef4444" id="v1PolyLeft" />
          <polygon points="20,15 40,5 40,25" fill="#ef4444" id="v1PolyRight" />
          <rect x="16" y="0" width="8" height="10" fill="#9ca3af" rx="1"/>
          <text x="20" y="-3" fill="#f3f4f6" font-size="8" font-weight="700" text-anchor="middle">SV1</text>
          <text x="20" y="34" fill="#9ca3af" font-size="7" text-anchor="middle">GPIO18</text>
        </g>

        <!-- SV2 (Sand Filter Solenoid) -->
        <g id="valveSV2" transform="translate(310, 165)">
          <polygon points="0,5 20,15 0,25" fill="#6b7280" id="v2PolyLeft" />
          <polygon points="20,15 40,5 40,25" fill="#6b7280" id="v2PolyRight" />
          <rect x="16" y="0" width="8" height="10" fill="#9ca3af" rx="1"/>
          <text x="20" y="-3" fill="#f3f4f6" font-size="8" font-weight="700" text-anchor="middle">SV2</text>
          <text x="20" y="34" fill="#9ca3af" font-size="7" text-anchor="middle">GPIO19</text>
        </g>

        <!-- SV3 (Targeted Media Solenoid) -->
        <g id="valveSV3" transform="translate(470, 165)">
          <polygon points="0,5 20,15 0,25" fill="#6b7280" id="v3PolyLeft" />
          <polygon points="20,15 40,5 40,25" fill="#6b7280" id="v3PolyRight" />
          <rect x="16" y="0" width="8" height="10" fill="#9ca3af" rx="1"/>
          <text x="20" y="-3" fill="#f3f4f6" font-size="8" font-weight="700" text-anchor="middle">SV3</text>
          <text x="20" y="34" fill="#9ca3af" font-size="7" text-anchor="middle">GPIO21</text>
        </g>

        <!-- SV4 (Carbon Polisher Solenoid) -->
        <g id="valveSV4" transform="translate(630, 165)">
          <polygon points="0,5 20,15 0,25" fill="#ef4444" id="v4PolyLeft" />
          <polygon points="20,15 40,5 40,25" fill="#ef4444" id="v4PolyRight" />
          <rect x="16" y="0" width="8" height="10" fill="#9ca3af" rx="1"/>
          <text x="20" y="-3" fill="#f3f4f6" font-size="8" font-weight="700" text-anchor="middle">SV4</text>
          <text x="20" y="34" fill="#9ca3af" font-size="7" text-anchor="middle">GPIO22</text>
        </g>

        <!-- SV5 (Recirculation / Diverter 3-way valve) -->
        <g id="valveSV5" transform="translate(820, 165)">
          <circle cx="20" cy="15" r="14" fill="#1f2937" stroke="#4b5563" stroke-width="2" id="v5Circle"/>
          <polygon points="8,15 32,8 32,22" fill="#ef4444" id="v5Arrow" />
          <text x="20" y="-3" fill="#f3f4f6" font-size="8" font-weight="700" text-anchor="middle">SV5</text>
          <text x="20" y="37" fill="#9ca3af" font-size="7" text-anchor="middle">DIVERT</text>
        </g>

        <!-- PRODUCT WATER STORAGE TANK (SAFE OUTPUT) -->
        <g id="productTankGroup" transform="translate(900, 110)">
          <rect x="0" y="0" width="75" height="130" rx="8" fill="#111827" stroke="#10b981" stroke-width="2" id="productTankOutline"/>
          <rect id="cleanTankWater" x="4" y="35" width="67" height="91" rx="4" fill="url(#cleanWaterGrad)" />
          <text x="37" y="65" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle">TREATED</text>
          <text x="37" y="78" fill="#a7f3d0" font-size="9" text-anchor="middle">SAFE WATER</text>
          <text id="productTankStatusTxt" x="37" y="105" fill="#34d399" font-size="9" font-weight="700" text-anchor="middle">IS 10500 OK</text>
          <circle id="productTankLed" cx="37" cy="15" r="4" fill="#10b981" />
        </g>

        <!-- SENSOR PROBE SAMPLING NODES ON PIPELINE -->
        <!-- In-situ Sensor Cluster 1: Raw Water Line -->
        <g transform="translate(125, 145)">
          <circle cx="0" cy="0" r="10" fill="#0f172a" stroke="#00f2fe" stroke-width="1.5" />
          <text x="0" y="3" fill="#00f2fe" font-size="7" font-weight="700" text-anchor="middle">RAW</text>
          <line x1="0" y1="10" x2="0" y2="35" stroke="#00f2fe" stroke-width="1" stroke-dasharray="2,2"/>
          <text x="0" y="47" fill="#38bdf8" font-size="7" text-anchor="middle">PROBES</text>
        </g>

        <!-- In-situ Sensor Cluster 2: Effluent Verification Line -->
        <g transform="translate(785, 145)">
          <circle cx="0" cy="0" r="10" fill="#0f172a" stroke="#10b981" stroke-width="1.5" />
          <text x="0" y="3" fill="#10b981" font-size="7" font-weight="700" text-anchor="middle">TEST</text>
          <line x1="0" y1="10" x2="0" y2="35" stroke="#10b981" stroke-width="1" stroke-dasharray="2,2"/>
          <text x="0" y="47" fill="#34d399" font-size="7" text-anchor="middle">VERIFY</text>
        </g>
      </svg>
    `;
  }

  /**
   * Update P&ID visual state based on firmware relays and treatment model
   */
  update(relays, systemHealth, activeStages, isDiverted) {
    // 1. Valve 1 (Inlet / Strainer)
    const sv1Active = relays[18] === 1;
    this.setValveState('v1PolyLeft', 'v1PolyRight', sv1Active);
    this.setPipeFlow('pipeRawToS1', sv1Active);
    this.setColumnHighlight('s1Rect', 's1Led', sv1Active, '#00f2fe');

    // 2. Valve 2 (Sand / Anthracite Media)
    const sv2Active = relays[19] === 1;
    this.setValveState('v2PolyLeft', 'v2PolyRight', sv2Active);
    this.setPipeFlow('pipeS1ToS2', sv1Active && sv2Active);
    this.setColumnHighlight('s2Rect', 's2Led', sv2Active, '#3b82f6');

    // 3. Valve 3 (Targeted Specialized Media)
    const sv3Active = relays[21] === 1;
    this.setValveState('v3PolyLeft', 'v3PolyRight', sv3Active);
    this.setPipeFlow('pipeS2ToS3', sv3Active);
    this.setColumnHighlight('s3Rect', 's3Led', sv3Active, '#f59e0b');

    // 4. Valve 4 (Carbon Polisher)
    const sv4Active = relays[22] === 1;
    this.setValveState('v4PolyLeft', 'v4PolyRight', sv4Active);
    this.setPipeFlow('pipeS3ToS4', sv4Active);
    this.setPipeFlow('pipeS4ToSV5', sv4Active);
    this.setColumnHighlight('s4Rect', 's4Led', sv4Active, '#10b981');

    // 5. Valve 5 & Diverter / Safe Destination
    const sv5Divert = relays[23] === 1 || isDiverted;
    const v5Arrow = document.getElementById('v5Arrow');
    const v5Circle = document.getElementById('v5Circle');
    const pipeSV5ToProduct = document.getElementById('pipeSV5ToProduct');
    const pipeRecircReturn = document.getElementById('pipeRecircReturn');
    const productTankStatusTxt = document.getElementById('productTankStatusTxt');
    const productTankLed = document.getElementById('productTankLed');
    const productTankOutline = document.getElementById('productTankOutline');

    if (sv5Divert) {
      // Divert to recirculation loop
      if (v5Arrow) {
        v5Arrow.setAttribute('fill', '#ef4444');
        v5Arrow.setAttribute('transform', 'rotate(90 20 15)');
      }
      if (v5Circle) v5Circle.setAttribute('stroke', '#ef4444');
      if (pipeSV5ToProduct) pipeSV5ToProduct.style.display = 'none';
      if (pipeRecircReturn) pipeRecircReturn.style.display = 'block';

      if (productTankStatusTxt) {
        productTankStatusTxt.textContent = "STANDBY / RECIRC";
        productTankStatusTxt.setAttribute('fill', '#f59e0b');
      }
      if (productTankLed) productTankLed.setAttribute('fill', '#ef4444');
      if (productTankOutline) productTankOutline.setAttribute('stroke', '#ef4444');
    } else {
      // Flow directly to Safe Product Water Tank
      if (v5Arrow) {
        v5Arrow.setAttribute('fill', '#10b981');
        v5Arrow.removeAttribute('transform');
      }
      if (v5Circle) v5Circle.setAttribute('stroke', '#10b981');
      if (pipeSV5ToProduct) pipeSV5ToProduct.style.display = 'block';
      if (pipeRecircReturn) pipeRecircReturn.style.display = 'none';

      if (productTankStatusTxt) {
        productTankStatusTxt.textContent = "IS 10500 OK";
        productTankStatusTxt.setAttribute('fill', '#10b981');
      }
      if (productTankLed) productTankLed.setAttribute('fill', '#10b981');
      if (productTankOutline) productTankOutline.setAttribute('stroke', '#10b981');
    }
  }

  setValveState(idLeft, idRight, isOpen) {
    const left = document.getElementById(idLeft);
    const right = document.getElementById(idRight);
    const color = isOpen ? '#10b981' : '#ef4444'; // Green if energized/open, Red if closed
    if (left) left.setAttribute('fill', color);
    if (right) right.setAttribute('fill', color);
  }

  setPipeFlow(pipeId, isActive) {
    const pipe = document.getElementById(pipeId);
    if (!pipe) return;
    if (isActive) {
      pipe.style.opacity = '1';
      pipe.setAttribute('filter', 'url(#neonGlow)');
    } else {
      pipe.style.opacity = '0.15';
      pipe.removeAttribute('filter');
    }
  }

  setColumnHighlight(rectId, ledId, isActive, activeColor) {
    const rect = document.getElementById(rectId);
    const led = document.getElementById(ledId);
    if (rect) {
      if (isActive) {
        rect.setAttribute('stroke', activeColor);
        rect.setAttribute('stroke-width', '2.5');
      } else {
        rect.setAttribute('stroke', '#374151');
        rect.setAttribute('stroke-width', '1.5');
      }
    }
    if (led) {
      led.setAttribute('fill', isActive ? activeColor : '#4b5563');
    }
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.PIDRenderer = PIDRenderer;
}
