/**
 * AquaSentinel - Embedded Microcontroller Firmware Emulation (ESP32 DevKit V1)
 *
 * Emulates the firmware that would run on an ESP32 micro-controller under FreeRTOS.
 * Provides:
 *  - 12-bit ADC sampling (0 - 4095 counts, 0.0 - 3.3V reference)
 *  - Moving-Average Digital Filter (window N=8) for ADC noise rejection
 *  - Temperature compensation (Nernst equation for pH, 2%/C for TDS)
 *  - IS 10500:2012 Drinking Water Specification comparator
 *  - Finite State Machine (FSM): BOOT -> ACQUISITION -> EVALUATION -> ACTUATION -> VERIFY -> ALARM
 *  - Relay output control (GPIO 18, 19, 21, 22, 23)
 *  - Virtual UART Serial 115200 baud telemetry & JSON MQTT packet generator
 */

class ESP32FirmwareCore {
  constructor() {
    // GPIO Pin Mapping (matching physical ESP32 DevKit V1)
    this.PINS = {
      // ADC1 Analog Inputs (12-bit, attenuated 11dB for 0-3.3V)
      ADC_PH: 34,        // ADC1_CH6: Analog pH probe (DFRobot SEN0161)
      ADC_TDS: 35,       // ADC1_CH7: Analog TDS sensor
      ADC_TURBIDITY: 36, // ADC1_CH0 / SENSOR_VP: Turbidity optical sensor
      ONE_WIRE_TEMP: 4,  // DS18B20 1-Wire temperature sensor
      FLOW_PULSE: 16,    // Hall-effect pulse flow meter (YF-S201)

      // Actuator Digital Outputs (Active HIGH via Optocoupled 5V Relay Board)
      RELAY_SV1_INLET: 18,     // Solenoid 1: Raw Water Inlet & Coarse Strainer
      RELAY_SV2_SEDIMENT: 19,  // Solenoid 2: Dual-Media Sand/Anthracite Bed
      RELAY_SV3_TARGET: 21,    // Solenoid 3: Targeted Media (Calcite/Alumina/Birm)
      RELAY_SV4_CARBON: 22,    // Solenoid 4: Granular Activated Carbon (GAC)
      RELAY_SV5_DIVERT: 23,    // Solenoid 5: Recirculation / Reject Diverter
      STATUS_LED_R: 25,        // RGB Alert LED - Red
      STATUS_LED_G: 26,        // RGB Alert LED - Green
      STATUS_LED_B: 27         // RGB Alert LED - Blue
    };

    // Bureau of Indian Standards IS 10500:2012 Drinking Water Specification
    this.STANDARDS = {
      PH: {
        acceptable_min: 6.5,
        acceptable_max: 8.5,
        permissible_min: 6.5, // No relaxation in IS 10500:2012
        permissible_max: 8.5
      },
      TDS: {
        acceptable_max: 500,    // mg/L (ppm)
        permissible_max: 2000   // Permissible in absence of alternate source
      },
      TURBIDITY: {
        acceptable_max: 1.0,    // NTU
        permissible_max: 5.0    // NTU
      },
      FLUORIDE: {
        acceptable_max: 1.0,    // mg/L
        permissible_max: 1.5    // mg/L (dental/skeletal fluorosis threshold)
      },
      IRON: {
        acceptable_max: 0.3,    // mg/L
        permissible_max: 1.0    // mg/L
      },
      ARSENIC: {
        acceptable_max: 0.01,   // mg/L (strictly restricted)
        permissible_max: 0.05   // mg/L
      }
    };

    // Digital Filter Buffer (Moving Average window size N=8)
    this.FILTER_WINDOW = 8;
    this.filterBuffers = {
      ph_adc: [],
      tds_adc: [],
      turbidity_adc: [],
      temp_raw: []
    };

    // FSM States
    this.FSM_STATES = {
      BOOT: 'STATE_BOOT',
      ACQUISITION: 'STATE_ACQUISITION',
      EVALUATION: 'STATE_EVALUATION',
      STAGE_CONTROL: 'STATE_STAGE_CONTROL',
      VERIFICATION: 'STATE_VERIFICATION',
      ALARM_HOLD: 'STATE_ALARM_HOLD'
    };
    this.currentState = this.FSM_STATES.BOOT;
    this.systemHealth = 'SAFE'; // 'SAFE', 'WARNING', 'CRITICAL'

    // Virtual GPIO Output State Register
    this.gpioOutputs = {
      [this.PINS.RELAY_SV1_INLET]: 0,
      [this.PINS.RELAY_SV2_SEDIMENT]: 0,
      [this.PINS.RELAY_SV3_TARGET]: 0,
      [this.PINS.RELAY_SV4_CARBON]: 0,
      [this.PINS.RELAY_SV5_DIVERT]: 0,
      [this.PINS.STATUS_LED_R]: 0,
      [this.PINS.STATUS_LED_G]: 1,
      [this.PINS.STATUS_LED_B]: 0
    };

    // Active treatment strategy recommendation
    this.activeTreatmentPlan = [];
    this.activeAlarms = [];

    // Telemetry log buffer for Virtual UART (115200 baud)
    this.serialBuffer = [];
    this.maxSerialLines = 150;
    this.bootTimestamp = Date.now();
    this.cycleCount = 0;

    // Simulated calibration constants
    this.calibrations = {
      ph_offset: 0.00,        // mV calibration offset at pH 7.00
      ph_slope: -59.16,       // Nernst slope at 25°C (mV/pH unit)
      tds_factor: 0.5,        // Electrical conductivity to TDS factor
      turbidity_k: -1120.4,   // Polynomial coefficient for optical turbidity
      turbidity_b: 5742.3
    };

    this.logSerial("SYSTEM", "ESP-IDF v4.4.2 Booting AquaSentinel Core on ESP32-WROOM-32...");
    this.logSerial("SYSTEM", "FreeRTOS Scheduler Initialized. 2 Cores running @ 240MHz.");
    this.logSerial("SYSTEM", "ADC1 12-bit calibration initialized with Vref=1100mV, 11dB attenuation (0-3.3V).");
    this.logSerial("SYSTEM", "Loaded IS 10500:2012 Drinking Water Specification standards from NVS Flash.");
  }

  /**
   * Log a formatted line to the Virtual UART Serial Terminal
   */
  logSerial(tag, message) {
    const uptimeSec = ((Date.now() - this.bootTimestamp) / 1000).toFixed(2);
    const line = `[+${uptimeSec.padStart(7, ' ')}s] [${tag.padEnd(8, ' ')}] ${message}`;
    this.serialBuffer.push(line);
    if (this.serialBuffer.length > this.maxSerialLines) {
      this.serialBuffer.shift();
    }
  }

  /**
   * Moving Average Digital Filter
   * Eliminates ADC random Gaussian noise and power-line hum (50Hz)
   */
  applyMovingAverage(buffer, sample) {
    buffer.push(sample);
    if (buffer.length > this.FILTER_WINDOW) {
      buffer.shift();
    }
    const sum = buffer.reduce((acc, v) => acc + v, 0);
    return sum / buffer.length;
  }

  /**
   * Convert physical sensor inputs to simulated 12-bit ADC counts with ADC noise
   */
  simulateADCReadings(rawPhysics) {
    // 1. pH probe: 0 to 14 pH maps to approximately 0 to 3.0V (centered around 1.65V)
    const phVolts = 1.65 - ((rawPhysics.ph - 7.0) * 0.133);
    const phClampedVolts = Math.max(0.1, Math.min(3.2, phVolts));
    const phAdcNoise = (Math.random() - 0.5) * 12; // +/- 6 ADC counts noise
    const rawPhAdc = Math.round((phClampedVolts / 3.3) * 4095 + phAdcNoise);

    // 2. TDS Sensor: 0 to 2000 ppm maps to 0 to 2.3V
    const tdsVolts = (rawPhysics.tds / 2000.0) * 2.3;
    const tdsClampedVolts = Math.max(0.05, Math.min(3.1, tdsVolts));
    const tdsAdcNoise = (Math.random() - 0.5) * 14;
    const rawTdsAdc = Math.round((tdsClampedVolts / 3.3) * 4095 + tdsAdcNoise);

    // 3. Turbidity Sensor: Inverse optical transmittance. Clean water = ~3.0V (low NTU), Dirty water = ~0.5V (high NTU)
    const turbVolts = Math.max(0.5, 3.0 - (rawPhysics.turbidity / 120.0) * 2.4);
    const turbNoise = (Math.random() - 0.5) * 16;
    const rawTurbAdc = Math.round((turbVolts / 3.3) * 4095 + turbNoise);

    // Filter the raw ADC counts
    const filteredPhAdc = this.applyMovingAverage(this.filterBuffers.ph_adc, rawPhAdc);
    const filteredTdsAdc = this.applyMovingAverage(this.filterBuffers.tds_adc, rawTdsAdc);
    const filteredTurbAdc = this.applyMovingAverage(this.filterBuffers.turbidity_adc, rawTurbAdc);

    return {
      raw_adc: {
        ph: rawPhAdc,
        tds: rawTdsAdc,
        turbidity: rawTurbAdc
      },
      filtered_adc: {
        ph: filteredPhAdc,
        tds: filteredTdsAdc,
        turbidity: filteredTurbAdc
      },
      voltages: {
        ph: (filteredPhAdc / 4095.0) * 3.3,
        tds: (filteredTdsAdc / 4095.0) * 3.3,
        turbidity: (filteredTurbAdc / 4095.0) * 3.3
      }
    };
  }

  /**
   * Convert Filtered ADC Voltages back to calibrated engineering units
   * Includes temperature compensation (DS18B20 feedback)
   */
  convertAdcToEngineeringUnits(voltages, tempC) {
    // 1. pH with Nernst Temperature Compensation
    const tempKelvin = tempC + 273.15;
    const nernstSlope = (0.0001984 * tempKelvin); // V/pH
    const phCalculated = 7.0 - (voltages.ph - 1.65) / (nernstSlope * 4.3);
    const phClamped = Number(Math.max(0.0, Math.min(14.0, phCalculated)).toFixed(2));

    // 2. TDS with Temperature Compensation coefficient (2.0% / °C reference 25°C)
    const tempCoeff = 1.0 + 0.02 * (tempC - 25.0);
    const compensatedVolts = voltages.tds / tempCoeff;
    const v = compensatedVolts;
    const tdsCalc = (133.42 * Math.pow(v, 3) - 255.86 * Math.pow(v, 2) + 857.39 * v) * 0.72;
    const tdsClamped = Math.max(10, Math.round(tdsCalc));

    // 3. Turbidity conversion (optical curve)
    const vTurb = Math.min(3.0, Math.max(0.5, voltages.turbidity));
    let turbCalc = (3.0 - vTurb) * 50.0;
    if (vTurb < 1.2) turbCalc += (1.2 - vTurb) * 80.0;
    const turbClamped = Number(Math.max(0.1, turbCalc).toFixed(1));

    return {
      ph: phClamped,
      tds: tdsClamped,
      turbidity: turbClamped,
      temperature: Number(tempC.toFixed(1))
    };
  }

  /**
   * FreeRTOS Task: Evaluate water quality against IS 10500:2012
   */
  evaluateWaterQuality(sensorData, labProfile) {
    const alarms = [];
    let healthScore = 'SAFE';

    // 1. pH Evaluation
    if (sensorData.ph < this.STANDARDS.PH.acceptable_min) {
      const isSevere = sensorData.ph < 5.5;
      alarms.push({
        parameter: 'pH',
        severity: isSevere ? 'CRITICAL' : 'WARNING',
        message: `Acidic Water (pH ${sensorData.ph} < ${this.STANDARDS.PH.acceptable_min} IS 10500 limit). Acid mine drainage or industrial runoff risk.`,
        code: 'ERR_PH_ACIDIC'
      });
      if (isSevere) healthScore = 'CRITICAL';
      else if (healthScore !== 'CRITICAL') healthScore = 'WARNING';
    } else if (sensorData.ph > this.STANDARDS.PH.acceptable_max) {
      const isSevere = sensorData.ph > 9.5;
      alarms.push({
        parameter: 'pH',
        severity: isSevere ? 'CRITICAL' : 'WARNING',
        message: `Alkaline Water (pH ${sensorData.ph} > ${this.STANDARDS.PH.acceptable_max} IS 10500 limit). Carbonate/mineral leaching risk.`,
        code: 'ERR_PH_ALKALINE'
      });
      if (isSevere) healthScore = 'CRITICAL';
      else if (healthScore !== 'CRITICAL') healthScore = 'WARNING';
    }

    // 2. Turbidity Evaluation
    if (sensorData.turbidity > this.STANDARDS.TURBIDITY.permissible_max) {
      alarms.push({
        parameter: 'Turbidity',
        severity: 'CRITICAL',
        message: `Severe Turbidity (${sensorData.turbidity} NTU > ${this.STANDARDS.TURBIDITY.permissible_max} NTU permissible). Silt/colloidal mining suspended solids.`,
        code: 'ERR_TURB_HIGH'
      });
      healthScore = 'CRITICAL';
    } else if (sensorData.turbidity > this.STANDARDS.TURBIDITY.acceptable_max) {
      alarms.push({
        parameter: 'Turbidity',
        severity: 'WARNING',
        message: `Elevated Turbidity (${sensorData.turbidity} NTU > ${this.STANDARDS.TURBIDITY.acceptable_max} NTU acceptable). Filtration required.`,
        code: 'WARN_TURB_ELEVATED'
      });
      if (healthScore !== 'CRITICAL') healthScore = 'WARNING';
    }

    // 3. TDS Evaluation
    if (sensorData.tds > this.STANDARDS.TDS.permissible_max) {
      alarms.push({
        parameter: 'TDS',
        severity: 'CRITICAL',
        message: `High Total Dissolved Solids (${sensorData.tds} ppm > ${this.STANDARDS.TDS.permissible_max} ppm permissible limit). Mineralization/salinity hazard.`,
        code: 'ERR_TDS_CRITICAL'
      });
      healthScore = 'CRITICAL';
    } else if (sensorData.tds > this.STANDARDS.TDS.acceptable_max) {
      alarms.push({
        parameter: 'TDS',
        severity: 'WARNING',
        message: `TDS exceeds desirable limit (${sensorData.tds} ppm > ${this.STANDARDS.TDS.acceptable_max} ppm desirable). Permissible only in absence of alternate source.`,
        code: 'WARN_TDS_MODERATE'
      });
      if (healthScore !== 'CRITICAL') healthScore = 'WARNING';
    }

    // 4. Lab-Confirmed Contaminant Profile (Fluoride, Iron, Arsenic)
    if (labProfile) {
      if (labProfile.fluoride > this.STANDARDS.FLUORIDE.permissible_max) {
        alarms.push({
          parameter: 'Fluoride (Lab)',
          severity: 'CRITICAL',
          message: `Elevated Fluoride (${labProfile.fluoride} mg/L > ${this.STANDARDS.FLUORIDE.permissible_max} mg/L). Chronic Dental/Skeletal Fluorosis risk in Jharkhand aquifer!`,
          code: 'ERR_FLUORIDE_TOXIC'
        });
        healthScore = 'CRITICAL';
      } else if (labProfile.fluoride > this.STANDARDS.FLUORIDE.acceptable_max) {
        alarms.push({
          parameter: 'Fluoride (Lab)',
          severity: 'WARNING',
          message: `Fluoride (${labProfile.fluoride} mg/L) exceeds desirable limit (1.0 mg/L).`,
          code: 'WARN_FLUORIDE_ELEVATED'
        });
        if (healthScore !== 'CRITICAL') healthScore = 'WARNING';
      }

      if (labProfile.iron > this.STANDARDS.IRON.permissible_max) {
        alarms.push({
          parameter: 'Iron (Lab)',
          severity: 'CRITICAL',
          message: `Heavy Iron Contamination (${labProfile.iron} mg/L > ${this.STANDARDS.IRON.permissible_max} mg/L). Mining leaching & pipe scaling.`,
          code: 'ERR_IRON_HIGH'
        });
        healthScore = 'CRITICAL';
      }

      if (labProfile.arsenic > this.STANDARDS.ARSENIC.permissible_max) {
        alarms.push({
          parameter: 'Arsenic (Lab)',
          severity: 'CRITICAL',
          message: `CRITICAL TOXICITY: Arsenic (${labProfile.arsenic} mg/L > ${this.STANDARDS.ARSENIC.permissible_max} mg/L). Carcinogenic risk! Immediate filtration diverter trip.`,
          code: 'ERR_ARSENIC_LETHAL'
        });
        healthScore = 'CRITICAL';
      }
    }

    this.activeAlarms = alarms;
    this.systemHealth = healthScore;
    return { healthScore, alarms };
  }

  /**
   * FreeRTOS Actuation Task: Control Solenoid Valves & Filtration Stages
   */
  dispatchTreatmentControl(sensorData, labProfile) {
    const activeStages = [];
    const relays = {
      [this.PINS.RELAY_SV1_INLET]: 1,     // Always open to allow raw feed
      [this.PINS.RELAY_SV2_SEDIMENT]: 0,  // Dual-media sediment
      [this.PINS.RELAY_SV3_TARGET]: 0,    // Specialized chemical media
      [this.PINS.RELAY_SV4_CARBON]: 0,    // GAC / Polishing
      [this.PINS.RELAY_SV5_DIVERT]: 0     // Recirculation diverter
    };

    activeStages.push({
      stage: 1,
      name: 'Stage 1: 50-Micron Coarse Strainer',
      relayPin: this.PINS.RELAY_SV1_INLET,
      active: true,
      reason: 'Standard raw water pre-filtration for physical debris and grit.'
    });

    // Determine Stage 2: Sand/Anthracite Dual-Media Filter
    // Activated if Turbidity > 1.0 NTU or general particulate load
    if (sensorData.turbidity > 1.0) {
      relays[this.PINS.RELAY_SV2_SEDIMENT] = 1;
      activeStages.push({
        stage: 2,
        name: 'Stage 2: Dual-Media Sand & Anthracite Bed',
        relayPin: this.PINS.RELAY_SV2_SEDIMENT,
        active: true,
        reason: `Turbidity (${sensorData.turbidity} NTU) > 1.0 NTU limit. Sand/anthracite bed engaged for colloidal silt removal.`
      });
    }

    // Determine Stage 3: Targeted Chemical Media
    // Activated if pH abnormal OR heavy mineral profile detected (Fluoride / Iron / Arsenic)
    const needPhCorrection = sensorData.ph < 6.5 || sensorData.ph > 8.5;
    const needFluorideTreatment = labProfile && labProfile.fluoride > 1.0;
    const needIronOxidation = labProfile && labProfile.iron > 0.3;
    const needArsenicRemoval = labProfile && labProfile.arsenic > 0.01;

    if (needPhCorrection || needFluorideTreatment || needIronOxidation || needArsenicRemoval) {
      relays[this.PINS.RELAY_SV3_TARGET] = 1;
      let targetDesc = [];
      if (sensorData.ph < 6.5) targetDesc.push('Calcite/Magnesite Neutralizer (Acid Correction)');
      if (sensorData.ph > 8.5) targetDesc.push('Citric/Mild Acid Neutralizer (Alkalinity Buffer)');
      if (needFluorideTreatment) targetDesc.push('Activated Alumina Bed (Fluoride Adsorption)');
      if (needIronOxidation) targetDesc.push('Birm/Manganese Greensand Media (Catalytic Iron Oxidation)');
      if (needArsenicRemoval) targetDesc.push('Iron-Oxide Coated Sand / Zero-Valent Iron Adsorption');

      activeStages.push({
        stage: 3,
        name: 'Stage 3: Targeted Specialized Treatment Media',
        relayPin: this.PINS.RELAY_SV3_TARGET,
        active: true,
        subsystems: targetDesc,
        reason: targetDesc.join(' + ')
      });
    }

    // Stage 4: Granular Activated Carbon (GAC) + Ultrafiltration Polisher
    // Activated if TDS is elevated, organic compounds/taste/odor exist, or standard final polish
    relays[this.PINS.RELAY_SV4_CARBON] = 1;
    activeStages.push({
      stage: 4,
      name: 'Stage 4: Granular Activated Carbon (GAC) & Micro-Polishing',
      relayPin: this.PINS.RELAY_SV4_CARBON,
      active: true,
      reason: 'Adsorption of residual heavy-metal traces, organic residues, color, and odor polishing.'
    });

    // Stage 5: Diverter Valve (SV5)
    // If water quality is unrecoverably CRITICAL (e.g. Arsenic extreme or system over-capacity),
    // divert to recirculation loop or hold for secondary batch pass
    if (this.systemHealth === 'CRITICAL' && labProfile && labProfile.arsenic > 0.05) {
      relays[this.PINS.RELAY_SV5_DIVERT] = 1; // Energize diverter to recycle
      activeStages.push({
        stage: 5,
        name: 'Safety Interlock: Recirculation Diverter Valve',
        relayPin: this.PINS.RELAY_SV5_DIVERT,
        active: true,
        reason: 'Effluent fails severe toxicity threshold. Diverted back to treatment buffer for secondary pass.'
      });
    }

    // Update internal GPIO registers
    this.gpioOutputs = { ...this.gpioOutputs, ...relays };

    // Update RGB LED indicators
    if (this.systemHealth === 'SAFE') {
      this.gpioOutputs[this.PINS.STATUS_LED_R] = 0;
      this.gpioOutputs[this.PINS.STATUS_LED_G] = 1;
      this.gpioOutputs[this.PINS.STATUS_LED_B] = 0;
    } else if (this.systemHealth === 'WARNING') {
      this.gpioOutputs[this.PINS.STATUS_LED_R] = 1;
      this.gpioOutputs[this.PINS.STATUS_LED_G] = 1;
      this.gpioOutputs[this.PINS.STATUS_LED_B] = 0;
    } else {
      this.gpioOutputs[this.PINS.STATUS_LED_R] = 1;
      this.gpioOutputs[this.PINS.STATUS_LED_G] = 0;
      this.gpioOutputs[this.PINS.STATUS_LED_B] = 0;
    }

    this.activeTreatmentPlan = activeStages;
    return { relays, activeStages };
  }

  /**
   * Main FreeRTOS Loop Tick (Simulates execution cycle every 250ms)
   */
  executeCycle(rawSensorInputs, labProfile) {
    this.cycleCount++;

    // Step 1: ADC Oversampling & Acquisition
    this.currentState = this.FSM_STATES.ACQUISITION;
    const adcData = this.simulateADCReadings(rawSensorInputs);

    // Step 2: Calibrate to Engineering Units
    const calibrated = this.convertAdcToEngineeringUnits(adcData.voltages, rawSensorInputs.temperature);

    // Step 3: Threshold Evaluation
    this.currentState = this.FSM_STATES.EVALUATION;
    const evalResult = this.evaluateWaterQuality(calibrated, labProfile);

    // Step 4: Actuator & Relay Dispatch
    this.currentState = this.FSM_STATES.STAGE_CONTROL;
    const actuation = this.dispatchTreatmentControl(calibrated, labProfile);

    // Periodically log telemetry via UART
    if (this.cycleCount % 4 === 0) { // Every ~1 sec
      this.logTelemetryPacket(calibrated, adcData, evalResult);
    }

    return {
      state: this.currentState,
      health: this.systemHealth,
      adc: adcData,
      calibrated: calibrated,
      alarms: evalResult.alarms,
      relays: actuation.relays,
      stages: actuation.activeStages,
      gpio: this.gpioOutputs,
      uptime: ((Date.now() - this.bootTimestamp) / 1000).toFixed(1)
    };
  }

  /**
   * Output formatted Serial Monitor Telemetry packet
   */
  logTelemetryPacket(sensor, adc, evaluation) {
    const activeRelayNames = Object.entries(this.gpioOutputs)
      .filter(([pin, val]) => val === 1 && [18, 19, 21, 22, 23].includes(Number(pin)))
      .map(([pin]) => `GPIO${pin}`)
      .join(',');

    this.logSerial("ADC_SMPL", `pH_ADC:${adc.raw_adc.ph} (${adc.voltages.ph.toFixed(2)}V) | TDS_ADC:${adc.raw_adc.tds} | TURB_ADC:${adc.raw_adc.turbidity}`);
    this.logSerial("METRICS", `pH:${sensor.ph} | TDS:${sensor.tds}ppm | Turb:${sensor.turbidity}NTU | Temp:${sensor.temperature}°C -> [${evaluation.healthScore}]`);
    this.logSerial("RELAY_IO", `Active Relays: [${activeRelayNames || 'NONE'}] | Health: ${this.systemHealth}`);

    if (evaluation.alarms.length > 0) {
      const topAlarm = evaluation.alarms[0];
      this.logSerial("ALARM_EVT", `[${topAlarm.severity}] ${topAlarm.code}: ${topAlarm.message.slice(0, 60)}...`);
    }

    // Simulate MQTT JSON Payload for Cloud Telemetry
    const mqttPayload = {
      device_id: "AQUA-SENTINEL-JH01",
      ts: Math.floor(Date.now() / 1000),
      status: this.systemHealth,
      ph: sensor.ph,
      tds: sensor.tds,
      turb: sensor.turbidity,
      relays: activeRelayNames
    };
    this.logSerial("MQTT_PUB", `Topic: 'aquasentinel/node_01/telemetry' -> ${JSON.stringify(mqttPayload)}`);
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.ESP32FirmwareCore = ESP32FirmwareCore;
}
