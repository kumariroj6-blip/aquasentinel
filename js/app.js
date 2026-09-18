/**
 * AquaSentinel - Master Application Coordinator
 *
 * Connects the UI, Embedded ESP32 Firmware Simulator, Water Treatment Physics,
 * P&ID Schematic, Canvas Strip Chart, and Virtual UART Serial Terminal.
 */

// Preset Jharkhand Contamination Scenarios
const PRESET_SCENARIOS = {
  SCENARIO_NORMAL: {
    id: "SCENARIO_NORMAL",
    name: "Scenario 1: Clean Rural Aquifer (Normal)",
    description: "Pristine groundwater passing all IS 10500:2012 drinking water standards. All treatment stages in standby/polishing mode.",
    raw: { ph: 7.20, tds: 280, turbidity: 0.8, temperature: 24.5, flow: 12.0 },
    lab: { fluoride: 0.45, iron: 0.12, arsenic: 0.002, region: "Ranchi Outskirts Groundwater" },
    location: {
      village: "Kanke Rural Block, Ranchi Outskirts",
      district: "Ranchi",
      state: "Jharkhand",
      lat: 23.4350,
      long: 85.3210
    }
  },
  SCENARIO_TURBID_RUNOFF: {
    id: "SCENARIO_TURBID_RUNOFF",
    name: "Scenario 2: Monsoon Mining Runoff (Turbid)",
    description: "Heavy silt and suspended colloidal matter (> 85 NTU) washed from opencast coal pit surfaces into local village ponds during monsoon rains.",
    raw: { ph: 6.90, tds: 420, turbidity: 88.0, temperature: 26.0, flow: 14.5 },
    lab: { fluoride: 0.60, iron: 0.25, arsenic: 0.003, region: "Dhanbad Opencast Coalfield Runoff" },
    location: {
      village: "Baghmara Opencast Pit Buffer",
      district: "Dhanbad",
      state: "Jharkhand",
      lat: 23.7957,
      long: 86.2081
    }
  },
  SCENARIO_ACID_MINE_DRAINAGE: {
    id: "SCENARIO_ACID_MINE_DRAINAGE",
    name: "Scenario 3: Dhanbad Acid Mine Drainage (AMD)",
    description: "Pyrite (FeS2) oxidation generates low pH acidic water (pH 3.8) with heavy dissolved ferrous/ferric iron (4.5 mg/L) and elevated sulfate mineralization.",
    raw: { ph: 3.80, tds: 1350, turbidity: 34.0, temperature: 27.5, flow: 10.0 },
    lab: { fluoride: 0.80, iron: 4.80, arsenic: 0.008, region: "Jharia / Dhanbad Deep Mine Seepage" },
    location: {
      village: "Jharia Colliery Drainage Zone",
      district: "Dhanbad",
      state: "Jharkhand",
      lat: 23.7410,
      long: 86.4150
    }
  },
  SCENARIO_FLUORIDE_BELT: {
    id: "SCENARIO_FLUORIDE_BELT",
    name: "Scenario 4: Palamu Fluorosis Aquifer (Fluoride)",
    description: "High geogenic fluoride leaching from granite/gneiss bedrocks in Palamu/Garhwa belt (3.8 mg/L). Causes dental and crippling skeletal fluorosis without treatment.",
    raw: { ph: 7.90, tds: 820, turbidity: 3.2, temperature: 25.0, flow: 11.0 },
    lab: { fluoride: 3.80, iron: 0.20, arsenic: 0.004, region: "Palamu/Daltonganj Deep Borewell" },
    location: {
      village: "Daltonganj Deep Aquifer Point",
      district: "Palamu",
      state: "Jharkhand",
      lat: 24.0370,
      long: 84.0720
    }
  },
  SCENARIO_CRITICAL_MULTI: {
    id: "SCENARIO_CRITICAL_MULTI",
    name: "Scenario 5: Multi-Contaminant Mining Seepage",
    description: "Severe combined contamination: Acidic pH (4.8), heavy colloidal silt (65 NTU), high mineralization (1650 ppm TDS), elevated Iron (3.4 mg/L), and trace Arsenic.",
    raw: { ph: 4.80, tds: 1650, turbidity: 65.0, temperature: 28.0, flow: 8.5 },
    lab: { fluoride: 2.10, iron: 3.40, arsenic: 0.045, region: "Chaibasa / West Singhbhum Mineral Belt" },
    location: {
      village: "Noamundi Iron Ore Seepage Zone",
      district: "West Singhbhum",
      state: "Jharkhand",
      lat: 22.1460,
      long: 85.4920
    }
  }
};

class AquaSentinelApp {
  constructor() {
    this.firmware = new ESP32FirmwareCore();
    this.physics = new WaterPhysicsSimulation();
    this.pidRenderer = new PIDRenderer('pidContainer');
    this.chart = new TelemetryChart('telemetryCanvas');

    // Current State Variables
    this.currentScenarioKey = 'SCENARIO_NORMAL';
    this.currentLocation = { ...PRESET_SCENARIOS.SCENARIO_NORMAL.location };
    this.rawSensors = { ...PRESET_SCENARIOS.SCENARIO_NORMAL.raw };
    this.labProfile = { ...PRESET_SCENARIOS.SCENARIO_NORMAL.lab };
    this.isSerialPaused = false;
    this.lastExecResult = null;
    this.lastPhysicsResult = null;

    // Simulation Tick interval (250ms = 4Hz FreeRTOS control task)
    this.timerInterval = null;

    this.initUI();
    this.bindEvents();
    this.loadScenario('SCENARIO_NORMAL');
    this.startLoop();
  }

  initUI() {
    this.dom = {
      // Scenario buttons
      scenarioButtons: document.querySelectorAll('.scenario-btn'),
      scenarioTitle: document.getElementById('scenarioTitle'),
      scenarioDesc: document.getElementById('scenarioDesc'),
      scenarioRegion: document.getElementById('scenarioRegion'),

      // Location / GPS elements
      locVillageTxt: document.getElementById('locVillageTxt'),
      locDistrictTxt: document.getElementById('locDistrictTxt'),
      locStateTxt: document.getElementById('locStateTxt'),
      locGpsTxt: document.getElementById('locGpsTxt'),
      btnUseDeviceGps: document.getElementById('btnUseDeviceGps'),
      btnEditLocation: document.getElementById('btnEditLocation'),
      locationDisplayGrid: document.getElementById('locationDisplayGrid'),
      locationEditGrid: document.getElementById('locationEditGrid'),
      inputLocVillage: document.getElementById('inputLocVillage'),
      inputLocDistrict: document.getElementById('inputLocDistrict'),
      inputLocLat: document.getElementById('inputLocLat'),
      inputLocLong: document.getElementById('inputLocLong'),
      btnSaveLocation: document.getElementById('btnSaveLocation'),
      btnCancelLocation: document.getElementById('btnCancelLocation'),

      // Sliders & Inputs
      sliderPh: document.getElementById('sliderPh'),
      sliderTds: document.getElementById('sliderTds'),
      sliderTurb: document.getElementById('sliderTurb'),
      sliderTemp: document.getElementById('sliderTemp'),
      sliderFlow: document.getElementById('sliderFlow'),

      // Slider value indicators
      valPh: document.getElementById('valPh'),
      valTds: document.getElementById('valTds'),
      valTurb: document.getElementById('valTurb'),
      valTemp: document.getElementById('valTemp'),
      valFlow: document.getElementById('valFlow'),

      // ADC displays
      adcPhTxt: document.getElementById('adcPhTxt'),
      adcTdsTxt: document.getElementById('adcTdsTxt'),
      adcTurbTxt: document.getElementById('adcTurbTxt'),

      // Lab contaminants
      labFluorideSelect: document.getElementById('labFluorideSelect'),
      labIronSelect: document.getElementById('labIronSelect'),
      labArsenicSelect: document.getElementById('labArsenicSelect'),

      // Master System Status
      masterStatusBadge: document.getElementById('masterStatusBadge'),
      fsmStateBadge: document.getElementById('fsmStateBadge'),
      mcuUptimeTxt: document.getElementById('mcuUptimeTxt'),
      coreFreqTxt: document.getElementById('coreFreqTxt'),
      activeAlertsContainer: document.getElementById('activeAlertsContainer'),

      // Treatment & Verification
      treatmentStagesList: document.getElementById('treatmentStagesList'),
      diverterStatusBadge: document.getElementById('diverterStatusBadge'),
      complianceRatingBadge: document.getElementById('complianceRatingBadge'),

      // Comparison Table Elements
      rawPhComp: document.getElementById('rawPhComp'),
      treatedPhComp: document.getElementById('treatedPhComp'),
      phEffComp: document.getElementById('phEffComp'),
      phStatusComp: document.getElementById('phStatusComp'),

      rawTdsComp: document.getElementById('rawTdsComp'),
      treatedTdsComp: document.getElementById('treatedTdsComp'),
      tdsEffComp: document.getElementById('tdsEffComp'),
      tdsStatusComp: document.getElementById('tdsStatusComp'),

      rawTurbComp: document.getElementById('rawTurbComp'),
      treatedTurbComp: document.getElementById('treatedTurbComp'),
      turbEffComp: document.getElementById('turbEffComp'),
      turbStatusComp: document.getElementById('turbStatusComp'),

      rawFluorideComp: document.getElementById('rawFluorideComp'),
      treatedFluorideComp: document.getElementById('treatedFluorideComp'),
      fluorideEffComp: document.getElementById('fluorideEffComp'),
      fluorideStatusComp: document.getElementById('fluorideStatusComp'),

      rawIronComp: document.getElementById('rawIronComp'),
      treatedIronComp: document.getElementById('treatedIronComp'),
      ironEffComp: document.getElementById('ironEffComp'),
      ironStatusComp: document.getElementById('ironStatusComp'),

      // Virtual UART Terminal
      serialOutput: document.getElementById('serialOutput'),
      btnCopySerial: document.getElementById('btnCopySerial'),
      btnClearSerial: document.getElementById('btnClearSerial'),
      btnPauseSerial: document.getElementById('btnPauseSerial'),

      // Chart Filter Buttons
      chartFilterBtns: document.querySelectorAll('.chart-filter-btn'),

      // GPIO Pins on Virtual Board
      gpioIndicators: {
        pin18: document.getElementById('gpio18Led'),
        pin19: document.getElementById('gpio19Led'),
        pin21: document.getElementById('gpio21Led'),
        pin22: document.getElementById('gpio22Led'),
        pin23: document.getElementById('gpio23Led'),
        pin34: document.getElementById('gpio34Led'),
        pin35: document.getElementById('gpio35Led'),
        pin36: document.getElementById('gpio36Led')
      }
    };
  }

  bindEvents() {
    // Scenario Buttons
    this.dom.scenarioButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const scenarioKey = btn.getAttribute('data-scenario');
        this.loadScenario(scenarioKey);
      });
    });

    // Slider Listeners (Dynamic Sandbox control)
    const updateFromSliders = () => {
      this.rawSensors.ph = parseFloat(this.dom.sliderPh.value);
      this.rawSensors.tds = parseFloat(this.dom.sliderTds.value);
      this.rawSensors.turbidity = parseFloat(this.dom.sliderTurb.value);
      this.rawSensors.temperature = parseFloat(this.dom.sliderTemp.value);
      this.rawSensors.flow = parseFloat(this.dom.sliderFlow.value);

      // Deselect scenario button styling if manually modified
      this.dom.scenarioButtons.forEach(b => b.classList.remove('active'));
      if (this.dom.scenarioTitle) this.dom.scenarioTitle.textContent = "Custom Manual Sandbox Mode";
      if (this.dom.scenarioDesc) this.dom.scenarioDesc.textContent = "User-overridden sensor inputs to stress test embedded decision logic.";
      if (this.dom.scenarioRegion) this.dom.scenarioRegion.textContent = "Custom Field Simulation";

      this.updateSliderDisplays();
    };

    this.dom.sliderPh.addEventListener('input', updateFromSliders);
    this.dom.sliderTds.addEventListener('input', updateFromSliders);
    this.dom.sliderTurb.addEventListener('input', updateFromSliders);
    this.dom.sliderTemp.addEventListener('input', updateFromSliders);
    this.dom.sliderFlow.addEventListener('input', updateFromSliders);

    // Lab Profile Dropdown Listeners
    this.dom.labFluorideSelect.addEventListener('change', (e) => {
      this.labProfile.fluoride = parseFloat(e.target.value);
    });
    this.dom.labIronSelect.addEventListener('change', (e) => {
      this.labProfile.iron = parseFloat(e.target.value);
    });
    this.dom.labArsenicSelect.addEventListener('change', (e) => {
      this.labProfile.arsenic = parseFloat(e.target.value);
    });

    // Serial Terminal Controls
    this.dom.btnClearSerial.addEventListener('click', () => {
      this.firmware.serialBuffer = [];
      this.dom.serialOutput.textContent = '';
    });

    this.dom.btnPauseSerial.addEventListener('click', () => {
      this.isSerialPaused = !this.isSerialPaused;
      this.dom.btnPauseSerial.textContent = this.isSerialPaused ? "Resume Stream" : "Pause Stream";
      this.dom.btnPauseSerial.classList.toggle('btn-warn', this.isSerialPaused);
    });

    this.dom.btnCopySerial.addEventListener('click', () => {
      const text = this.firmware.serialBuffer.join('\n');
      navigator.clipboard.writeText(text).then(() => {
        const orig = this.dom.btnCopySerial.textContent;
        this.dom.btnCopySerial.textContent = "Copied!";
        setTimeout(() => { this.dom.btnCopySerial.textContent = orig; }, 1500);
      });
    });

    // Chart Filter Channels
    this.dom.chartFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.chartFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const ch = btn.getAttribute('data-channel');
        this.chart.setFilter(ch);
      });
    });

    // Location / GPS Event Handlers
    if (this.dom.btnUseDeviceGps) {
      this.dom.btnUseDeviceGps.addEventListener('click', () => {
        if ("geolocation" in navigator) {
          this.dom.btnUseDeviceGps.textContent = "⏳ Detecting...";
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              this.currentLocation.lat = parseFloat(pos.coords.latitude.toFixed(4));
              this.currentLocation.long = parseFloat(pos.coords.longitude.toFixed(4));
              this.currentLocation.village = "Current Field Location";
              this.currentLocation.district = "Live GPS Sensor Node";
              this.currentLocation.state = "Jharkhand";
              this.updateLocationDisplay();
              this.dom.btnUseDeviceGps.textContent = "📡 GPS Synced!";
              this.firmware.logSerial("GPS_LOC", `Device GPS Synced: Lat ${this.currentLocation.lat}° N, Long ${this.currentLocation.long}° E`);
              setTimeout(() => {
                this.dom.btnUseDeviceGps.textContent = "📡 Use Current Location";
              }, 2500);
            },
            (err) => {
              alert("Unable to access device GPS (Permission denied or timeout). Using sample field coordinates.");
              this.dom.btnUseDeviceGps.textContent = "📡 Use Current Location";
            },
            { timeout: 8000 }
          );
        } else {
          alert("Browser geolocation not supported on this device.");
        }
      });
    }

    if (this.dom.btnEditLocation) {
      this.dom.btnEditLocation.addEventListener('click', () => {
        const isEditing = this.dom.locationEditGrid.style.display !== 'none';
        this.dom.locationEditGrid.style.display = isEditing ? 'none' : 'grid';
        this.dom.locationDisplayGrid.style.display = isEditing ? 'grid' : 'none';
        this.dom.btnEditLocation.textContent = isEditing ? "✏️ Edit Location" : "✖ Close Edit";
      });
    }

    if (this.dom.btnSaveLocation) {
      this.dom.btnSaveLocation.addEventListener('click', () => {
        this.currentLocation.village = this.dom.inputLocVillage.value || "Sample Village";
        this.currentLocation.district = this.dom.inputLocDistrict.value || "Ranchi";
        this.currentLocation.lat = parseFloat(this.dom.inputLocLat.value) || 23.4350;
        this.currentLocation.long = parseFloat(this.dom.inputLocLong.value) || 85.3210;
        this.updateLocationDisplay();
        this.dom.locationEditGrid.style.display = 'none';
        this.dom.locationDisplayGrid.style.display = 'grid';
        this.dom.btnEditLocation.textContent = "✏️ Edit Location";
        this.firmware.logSerial("GPS_LOC", `Location Manual Update: ${this.currentLocation.village}, ${this.currentLocation.district} [${this.currentLocation.lat}°N, ${this.currentLocation.long}°E]`);
      });
    }

    if (this.dom.btnCancelLocation) {
      this.dom.btnCancelLocation.addEventListener('click', () => {
        this.updateLocationDisplay();
        this.dom.locationEditGrid.style.display = 'none';
        this.dom.locationDisplayGrid.style.display = 'grid';
        this.dom.btnEditLocation.textContent = "✏️ Edit Location";
      });
    }
  }

  updateLocationDisplay() {
    if (this.dom.locVillageTxt) this.dom.locVillageTxt.textContent = this.currentLocation.village;
    if (this.dom.locDistrictTxt) this.dom.locDistrictTxt.textContent = this.currentLocation.district;
    if (this.dom.locStateTxt) this.dom.locStateTxt.textContent = this.currentLocation.state || "Jharkhand";
    if (this.dom.locGpsTxt) this.dom.locGpsTxt.textContent = `${this.currentLocation.lat.toFixed(4)}° N, ${this.currentLocation.long.toFixed(4)}° E`;

    if (this.dom.inputLocVillage) this.dom.inputLocVillage.value = this.currentLocation.village;
    if (this.dom.inputLocDistrict) this.dom.inputLocDistrict.value = this.currentLocation.district;
    if (this.dom.inputLocLat) this.dom.inputLocLat.value = this.currentLocation.lat;
    if (this.dom.inputLocLong) this.dom.inputLocLong.value = this.currentLocation.long;
  }

  loadScenario(scenarioKey) {
    const sc = PRESET_SCENARIOS[scenarioKey];
    if (!sc) return;

    this.currentScenarioKey = scenarioKey;
    this.rawSensors = { ...sc.raw };
    this.labProfile = { ...sc.lab };
    if (sc.location) {
      this.currentLocation = { ...sc.location };
      this.updateLocationDisplay();
    }

    // Update Buttons UI
    this.dom.scenarioButtons.forEach(btn => {
      if (btn.getAttribute('data-scenario') === scenarioKey) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update Scenario Info
    if (this.dom.scenarioTitle) this.dom.scenarioTitle.textContent = sc.name;
    if (this.dom.scenarioDesc) this.dom.scenarioDesc.textContent = sc.description;
    if (this.dom.scenarioRegion) this.dom.scenarioRegion.textContent = sc.lab.region;

    // Update Slider inputs
    this.dom.sliderPh.value = this.rawSensors.ph;
    this.dom.sliderTds.value = this.rawSensors.tds;
    this.dom.sliderTurb.value = this.rawSensors.turbidity;
    this.dom.sliderTemp.value = this.rawSensors.temperature;
    this.dom.sliderFlow.value = this.rawSensors.flow;

    // Update Lab Selects
    this.dom.labFluorideSelect.value = String(this.labProfile.fluoride);
    this.dom.labIronSelect.value = String(this.labProfile.iron);
    this.dom.labArsenicSelect.value = String(this.labProfile.arsenic);

    this.updateSliderDisplays();
    this.firmware.logSerial("SCENARIO", `Loaded Preset Profile: [${sc.name}]`);
    if (sc.location) {
      this.firmware.logSerial("GPS_LOC", `Field Site: ${sc.location.village}, ${sc.location.district} [${sc.location.lat.toFixed(4)}°N, ${sc.location.long.toFixed(4)}°E]`);
    }
  }

  updateSliderDisplays() {
    this.dom.valPh.textContent = this.rawSensors.ph.toFixed(2);
    this.dom.valTds.textContent = `${Math.round(this.rawSensors.tds)} ppm`;
    this.dom.valTurb.textContent = `${this.rawSensors.turbidity.toFixed(1)} NTU`;
    this.dom.valTemp.textContent = `${this.rawSensors.temperature.toFixed(1)} °C`;
    this.dom.valFlow.textContent = `${this.rawSensors.flow.toFixed(1)} L/m`;
  }

  startLoop() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    // FreeRTOS Task Scheduler emulation: 250ms tick
    this.timerInterval = setInterval(() => {
      this.tick();
    }, 250);
  }

  tick() {
    // 1. Execute ESP32 Firmware Cycle
    const mcuResult = this.firmware.executeCycle(this.rawSensors, this.labProfile);
    this.lastExecResult = mcuResult;

    // 2. Execute Water Physics & Treatment mass balance
    const physicsResult = this.physics.processFiltration(mcuResult.calibrated, this.labProfile, mcuResult.relays);
    this.lastPhysicsResult = physicsResult;

    // 3. Update P&ID SVG Diagram
    this.pidRenderer.update(
      mcuResult.relays,
      mcuResult.health,
      mcuResult.stages,
      physicsResult.diverterActive
    );

    // 4. Update Real-Time Chart
    this.chart.pushData(
      mcuResult.calibrated.ph,
      mcuResult.calibrated.tds,
      mcuResult.calibrated.turbidity
    );

    // 5. Update UI Dashboards & Components
    this.updateDashboardUI(mcuResult, physicsResult);
  }

  updateDashboardUI(mcu, physics) {
    // ADC Counts & Voltages readout
    if (this.dom.adcPhTxt) {
      this.dom.adcPhTxt.textContent = `ADC:${mcu.adc.filtered_adc.ph.toFixed(0)} (${mcu.adc.voltages.ph.toFixed(2)}V)`;
    }
    if (this.dom.adcTdsTxt) {
      this.dom.adcTdsTxt.textContent = `ADC:${mcu.adc.filtered_adc.tds.toFixed(0)} (${mcu.adc.voltages.tds.toFixed(2)}V)`;
    }
    if (this.dom.adcTurbTxt) {
      this.dom.adcTurbTxt.textContent = `ADC:${mcu.adc.filtered_adc.turbidity.toFixed(0)} (${mcu.adc.voltages.turbidity.toFixed(2)}V)`;
    }

    // System Health & State Badges
    this.updateHealthBadge(mcu.health);
    if (this.dom.fsmStateBadge) this.dom.fsmStateBadge.textContent = mcu.state;
    if (this.dom.mcuUptimeTxt) this.dom.mcuUptimeTxt.textContent = `${mcu.uptime}s`;

    // Active Alarms Render
    this.renderAlarms(mcu.alarms);

    // Treatment Stages List
    this.renderTreatmentStages(mcu.stages, physics.stageHistory);

    // GPIO Board LED states
    this.updateGPIOBoard(mcu.gpio);

    // Before vs After Comparison Card
    this.renderComparisonTable(physics);

    // Virtual Serial Monitor
    if (!this.isSerialPaused && this.dom.serialOutput) {
      this.dom.serialOutput.textContent = this.firmware.serialBuffer.join('\n');
      this.dom.serialOutput.scrollTop = this.dom.serialOutput.scrollHeight;
    }
  }

  updateHealthBadge(health) {
    const badge = this.dom.masterStatusBadge;
    if (!badge) return;

    badge.className = 'status-badge';
    if (health === 'SAFE') {
      badge.classList.add('badge-safe');
      badge.innerHTML = `<span class="indicator-dot dot-green"></span> SYSTEM SAFE - IS 10500 COMPLIANT`;
    } else if (health === 'WARNING') {
      badge.classList.add('badge-warning');
      badge.innerHTML = `<span class="indicator-dot dot-amber"></span> WARNING - PERMISSIBLE THRESHOLD EXCEEDED`;
    } else {
      badge.classList.add('badge-critical');
      badge.innerHTML = `<span class="indicator-dot dot-red"></span> CRITICAL - SEVERE CONTAMINATION DETECTED`;
    }
  }

  renderAlarms(alarms) {
    const container = this.dom.activeAlertsContainer;
    if (!container) return;

    if (alarms.length === 0) {
      container.innerHTML = `
        <div class="alarm-item alarm-none">
          <span class="alarm-icon">✓</span>
          <div class="alarm-content">
            <div class="alarm-title">All Parameters Within Safe Indian Drinking Water Limits</div>
            <div class="alarm-desc">No abnormal water quality anomalies detected. Routine monitoring active.</div>
          </div>
        </div>
      `;
      return;
    }

    let html = '';
    alarms.forEach(a => {
      const isCrit = a.severity === 'CRITICAL';
      html += `
        <div class="alarm-item ${isCrit ? 'alarm-crit' : 'alarm-warn'}">
          <span class="alarm-icon">${isCrit ? '⚠' : '⚡'}</span>
          <div class="alarm-content">
            <div class="alarm-title">${a.parameter} — [${a.code}] ${a.severity}</div>
            <div class="alarm-desc">${a.message}</div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  renderTreatmentStages(activeStages, stageHistory) {
    const list = this.dom.treatmentStagesList;
    if (!list) return;

    let html = '';
    stageHistory.forEach(s => {
      const isActive = s.status === 'ACTIVE';
      html += `
        <div class="stage-card ${isActive ? 'stage-active' : 'stage-idle'}">
          <div class="stage-header">
            <span class="stage-name">${s.name}</span>
            <span class="stage-status-pill ${isActive ? 'pill-active' : 'pill-idle'}">${s.status}</span>
          </div>
          <div class="stage-details">${s.effect || 'Media in standby.'}</div>
        </div>
      `;
    });
    list.innerHTML = html;
  }

  updateGPIOBoard(gpio) {
    const ind = this.dom.gpioIndicators;
    if (!ind) return;

    const setLed = (el, state) => {
      if (!el) return;
      if (state === 1) {
        el.classList.add('led-on');
      } else {
        el.classList.remove('led-on');
      }
    };

    setLed(ind.pin18, gpio[18]);
    setLed(ind.pin19, gpio[19]);
    setLed(ind.pin21, gpio[21]);
    setLed(ind.pin22, gpio[22]);
    setLed(ind.pin23, gpio[23]);

    // Analog pins always active when sampling
    setLed(ind.pin34, 1);
    setLed(ind.pin35, 1);
    setLed(ind.pin36, 1);
  }

  renderComparisonTable(physics) {
    const { raw, treated, efficiencies, compliance, labRaw, diverterActive, finalDestination } = physics;

    // pH
    if (this.dom.rawPhComp) this.dom.rawPhComp.textContent = raw.ph.toFixed(2);
    if (this.dom.treatedPhComp) this.dom.treatedPhComp.textContent = treated.ph.toFixed(2);
    if (this.dom.phEffComp) {
      const phShift = treated.ph - raw.ph;
      this.dom.phEffComp.textContent = phShift > 0 ? `+${phShift.toFixed(2)} (Buffered)` : `${phShift.toFixed(2)}`;
    }
    if (this.dom.phStatusComp) this.setBadgeStatus(this.dom.phStatusComp, compliance.checks.ph.status);

    // TDS
    if (this.dom.rawTdsComp) this.dom.rawTdsComp.textContent = `${Math.round(raw.tds)} ppm`;
    if (this.dom.treatedTdsComp) this.dom.treatedTdsComp.textContent = `${treated.tds} ppm`;
    if (this.dom.tdsEffComp) this.dom.tdsEffComp.textContent = `-${efficiencies.tds}%`;
    if (this.dom.tdsStatusComp) this.setBadgeStatus(this.dom.tdsStatusComp, compliance.checks.tds.status);

    // Turbidity
    if (this.dom.rawTurbComp) this.dom.rawTurbComp.textContent = `${raw.turbidity.toFixed(1)} NTU`;
    if (this.dom.treatedTurbComp) this.dom.treatedTurbComp.textContent = `${treated.turbidity.toFixed(2)} NTU`;
    if (this.dom.turbEffComp) this.dom.turbEffComp.textContent = `-${efficiencies.turbidity}%`;
    if (this.dom.turbStatusComp) this.setBadgeStatus(this.dom.turbStatusComp, compliance.checks.turbidity.status);

    // Fluoride
    const rawF = labRaw ? labRaw.fluoride : 0.4;
    if (this.dom.rawFluorideComp) this.dom.rawFluorideComp.textContent = `${rawF.toFixed(2)} mg/L`;
    if (this.dom.treatedFluorideComp) this.dom.treatedFluorideComp.textContent = `${treated.fluoride.toFixed(2)} mg/L`;
    if (this.dom.fluorideEffComp) this.dom.fluorideEffComp.textContent = `-${efficiencies.fluoride}%`;
    if (this.dom.fluorideStatusComp) this.setBadgeStatus(this.dom.fluorideStatusComp, compliance.checks.fluoride.status);

    // Iron
    const rawFe = labRaw ? labRaw.iron : 0.1;
    if (this.dom.rawIronComp) this.dom.rawIronComp.textContent = `${rawFe.toFixed(2)} mg/L`;
    if (this.dom.treatedIronComp) this.dom.treatedIronComp.textContent = `${treated.iron.toFixed(2)} mg/L`;
    if (this.dom.ironEffComp) this.dom.ironEffComp.textContent = `-${efficiencies.iron}%`;
    if (this.dom.ironStatusComp) this.setBadgeStatus(this.dom.ironStatusComp, compliance.checks.iron.status);

    // Diverter Badge
    if (this.dom.diverterStatusBadge) {
      if (diverterActive) {
        this.dom.diverterStatusBadge.textContent = "TRIPPED: RECIRCULATION DIVERTER (SV5)";
        this.dom.diverterStatusBadge.className = "dest-badge dest-recirc";
      } else {
        this.dom.diverterStatusBadge.textContent = "AUTHORIZED: DISCHARGED TO SAFE POTABLE TANK";
        this.dom.diverterStatusBadge.className = "dest-badge dest-safe";
      }
    }

    if (this.dom.complianceRatingBadge) {
      this.dom.complianceRatingBadge.textContent = compliance.rating;
      this.dom.complianceRatingBadge.className = `rating-badge ${compliance.overallPass ? 'rate-pass' : 'rate-fail'}`;
    }
  }

  setBadgeStatus(element, status) {
    if (!element) return;
    element.textContent = status;
    element.className = 'status-tag';
    if (status === 'PASS') element.classList.add('tag-pass');
    else if (status === 'PERMISSIBLE') element.classList.add('tag-permissible');
    else element.classList.add('tag-fail');
  }
}

// Launch on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.aquaApp = new AquaSentinelApp();
});
