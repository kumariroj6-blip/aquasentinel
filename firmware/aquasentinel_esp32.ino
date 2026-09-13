/**
 * ============================================================================
 * Project: AquaSentinel - Embedded Firmware for ESP32 DevKit V1
 * Purpose: Water Quality Monitoring & Multi-Stage Filtration Controller
 * Target:  Smart India Hackathon (SIH) - Jharkhand Water Quality Initiative
 * Author:  AquaSentinel Student Team (EE & Embedded Track)
 * ============================================================================
 * 
 * Target Board: ESP32 DevKit V1 (ESP-WROOM-32, 240MHz, 4MB Flash)
 * Framework:    Arduino Core for ESP32 with FreeRTOS multitasking
 * 
 * SENSORS:
 *  - pH Probe: Analog pH Meter (DFRobot SEN0161) on GPIO 34 (ADC1_CH6)
 *  - TDS Probe: Analog TDS Meter on GPIO 35 (ADC1_CH7)
 *  - Turbidity: Optical Turbidity Sensor (TS-300B) on GPIO 36 (ADC1_CH0 / SENSOR_VP)
 *  - Temperature: DS18B20 Digital Thermometer on GPIO 4 (Dallas 1-Wire)
 *  - Flow Rate: YF-S201 Hall-Effect Flow Meter on GPIO 16 (Hardware Interrupt)
 * 
 * ACTUATORS (5-Channel 5V Optocoupled Relay Board -> 12V Solenoid Valves):
 *  - Relay 1: GPIO 18 -> Solenoid Valve 1 (SV1): Raw Inlet / 50μm Pre-Strainer
 *  - Relay 2: GPIO 19 -> Solenoid Valve 2 (SV2): Dual-Media Sand/Anthracite Bed
 *  - Relay 3: GPIO 21 -> Solenoid Valve 3 (SV3): Targeted Chemical Media (Al2O3/Birm/Calcite)
 *  - Relay 4: GPIO 22 -> Solenoid Valve 4 (SV4): Granular Activated Carbon (GAC) + UF
 *  - Relay 5: GPIO 23 -> Solenoid Valve 5 (SV5): Safety Recirculation / Diverter Valve
 * 
 * STANDARDS COMPLIANCE:
 *  - Bureau of Indian Standards IS 10500:2012 Drinking Water Specification
 * ============================================================================
 */

#include <Arduino.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ----------------------------------------------------------------------------
// PIN DEFINITIONS
// ----------------------------------------------------------------------------
#define PIN_ADC_PH         34
#define PIN_ADC_TDS        35
#define PIN_ADC_TURBIDITY  36
#define PIN_ONEWIRE_TEMP   4
#define PIN_FLOW_PULSE     16

#define PIN_RELAY_SV1      18
#define PIN_RELAY_SV2      19
#define PIN_RELAY_SV3      21
#define PIN_RELAY_SV4      22
#define PIN_RELAY_SV5      23

#define PIN_LED_SAFE       25
#define PIN_LED_WARN       26
#define PIN_LED_CRIT       27

// ----------------------------------------------------------------------------
// IS 10500:2012 DRINKING WATER STANDARDS
// ----------------------------------------------------------------------------
const float IS_PH_MIN_ACCEPTABLE      = 6.5f;
const float IS_PH_MAX_ACCEPTABLE      = 8.5f;
const float IS_TDS_MAX_ACCEPTABLE     = 500.0f;   // mg/L (ppm)
const float IS_TDS_MAX_PERMISSIBLE    = 2000.0f;  // In absence of alternate source
const float IS_TURB_MAX_ACCEPTABLE    = 1.0f;     // NTU
const float IS_TURB_MAX_PERMISSIBLE   = 5.0f;     // NTU

// ----------------------------------------------------------------------------
// MOVING AVERAGE FILTER CLASS (Noise Rejection for ADC)
// ----------------------------------------------------------------------------
template<typename T, size_t N>
class MovingAverageFilter {
private:
  T buffer[N];
  size_t head = 0;
  size_t count = 0;
  T runningSum = 0;

public:
  MovingAverageFilter() {
    for (size_t i = 0; i < N; ++i) buffer[i] = 0;
  }

  T addSample(T sample) {
    if (count < N) {
      runningSum += sample;
      buffer[head] = sample;
      count++;
    } else {
      runningSum = runningSum - buffer[head] + sample;
      buffer[head] = sample;
    }
    head = (head + 1) % N;
    return runningSum / count;
  }

  T getAverage() const {
    return count > 0 ? (runningSum / count) : 0;
  }
};

// Moving average filters for analog readings (Window size = 10)
MovingAverageFilter<uint16_t, 10> filterPhAdc;
MovingAverageFilter<uint16_t, 10> filterTdsAdc;
MovingAverageFilter<uint16_t, 10> filterTurbAdc;

// ----------------------------------------------------------------------------
// DATA STRUCTURES
// ----------------------------------------------------------------------------
enum SystemHealth {
  HEALTH_SAFE,
  HEALTH_WARNING,
  HEALTH_CRITICAL
};

enum SystemFsmState {
  STATE_BOOT,
  STATE_ACQUISITION,
  STATE_EVALUATION,
  STATE_ACTUATION,
  STATE_VERIFICATION
};

struct SensorReadings {
  float ph;
  float tds;
  float turbidity;
  float temperature;
  float flowRateLpm;
  uint16_t rawAdcPh;
  uint16_t rawAdcTds;
  uint16_t rawAdcTurb;
};

struct ActuatorStates {
  bool sv1_inlet;
  bool sv2_sediment;
  bool sv3_targeted;
  bool sv4_carbon;
  bool sv5_diverter;
};

// Global Shared State (Protected by Mutex in FreeRTOS)
SensorReadings g_sensors;
ActuatorStates g_relays;
SystemHealth g_health = HEALTH_SAFE;
SystemFsmState g_state = STATE_BOOT;
SemaphoreHandle_t g_stateMutex;

// Temperature Sensor Bus
OneWire oneWire(PIN_ONEWIRE_TEMP);
DallasTemperature tempSensors(&oneWire);

// Flow Meter Pulse Counter
volatile uint32_t g_flowPulseCount = 0;
void IRAM_ATTR flowPulseISR() {
  g_flowPulseCount++;
}

// ----------------------------------------------------------------------------
// CALIBRATION & CONVERSION HELPER FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Convert raw 12-bit ADC to calibrated pH with Nernst Temperature Compensation
 */
float calculateCalibratedPH(uint16_t adcCounts, float tempC) {
  // 12-bit ADC on 3.3V reference
  float voltage = ((float)adcCounts / 4095.0f) * 3.3f;
  
  // Standard pH probe calibration: Neutral point (pH 7.00) = 1.65V
  // Nernst slope at temperature T(K)
  float tempKelvin = tempC + 273.15f;
  float nernstSlope = 0.0001984f * tempKelvin; // V/pH unit
  
  float calculatedPh = 7.0f - (voltage - 1.65f) / (nernstSlope * 4.3f);
  if (calculatedPh < 0.0f) calculatedPh = 0.0f;
  if (calculatedPh > 14.0f) calculatedPh = 14.0f;
  return calculatedPh;
}

/**
 * Convert raw ADC to TDS with 2%/°C temperature compensation
 */
float calculateCalibratedTDS(uint16_t adcCounts, float tempC) {
  float voltage = ((float)adcCounts / 4095.0f) * 3.3f;
  
  // Temperature compensation coefficient
  float tempCoeff = 1.0f + 0.02f * (tempC - 25.0f);
  float compVoltage = voltage / tempCoeff;
  
  // DFRobot standard 3rd order polynomial for analog TDS meter
  float v = compVoltage;
  float tds = (133.42f * v * v * v - 255.86f * v * v + 857.39f * v) * 0.72f;
  if (tds < 0.0f) tds = 0.0f;
  return tds;
}

/**
 * Convert raw optical voltage to Turbidity (NTU)
 */
float calculateCalibratedTurbidity(uint16_t adcCounts) {
  float voltage = ((float)adcCounts / 4095.0f) * 3.3f;
  if (voltage > 3.0f) voltage = 3.0f;
  if (voltage < 0.5f) voltage = 0.5f;
  
  // Optical sensor inverse curve: 3.0V = clear water, <1.0V = highly turbid
  float ntu = (3.0f - voltage) * 50.0f;
  if (voltage < 1.2f) {
    ntu += (1.2f - voltage) * 80.0f;
  }
  return ntu;
}

// ----------------------------------------------------------------------------
// FREERTOS TASKS
// ----------------------------------------------------------------------------

/**
 * Task 1: Sensor Acquisition Task (Pinned to Core 0, 50Hz / 20ms)
 * Reads analog voltages, performs oversampling, averages noise, and converts units.
 */
void TaskSensorAcquisition(void *pvParameters) {
  TickType_t xLastWakeTime = xTaskGetTickCount();
  const TickType_t xFrequency = pdMS_TO_TICKS(50); // 50ms (20Hz sampling)

  for (;;) {
    // 1. Read Raw ADC channels (16x oversampling to improve effective resolution)
    uint32_t sumPh = 0, sumTds = 0, sumTurb = 0;
    for (int i = 0; i < 16; i++) {
      sumPh   += analogRead(PIN_ADC_PH);
      sumTds  += analogRead(PIN_ADC_TDS);
      sumTurb += analogRead(PIN_ADC_TURBIDITY);
      vTaskDelay(pdMS_TO_TICKS(1));
    }
    uint16_t avgRawPh   = sumPh / 16;
    uint16_t avgRawTds  = sumTds / 16;
    uint16_t avgRawTurb = sumTurb / 16;

    // 2. Apply digital moving average filtering
    uint16_t filteredPh   = filterPhAdc.addSample(avgRawPh);
    uint16_t filteredTds  = filterTdsAdc.addSample(avgRawTds);
    uint16_t filteredTurb = filterTurbAdc.addSample(avgRawTurb);

    // 3. Read 1-Wire Temperature
    tempSensors.requestTemperatures();
    float tempC = tempSensors.getTempCByIndex(0);
    if (tempC < -50.0f || tempC > 80.0f) tempC = 25.0f; // Default fallback if disconnected

    // 4. Calculate Flow Rate from pulse counter
    static uint32_t lastFlowTime = 0;
    uint32_t now = millis();
    float flowLpm = 0.0f;
    if (now - lastFlowTime >= 1000) {
      // YF-S201: 7.5 pulses per second = 1 L/min
      flowLpm = ((float)g_flowPulseCount / 7.5f);
      g_flowPulseCount = 0;
      lastFlowTime = now;
    }

    // 5. Convert to calibrated engineering units
    float ph = calculateCalibratedPH(filteredPh, tempC);
    float tds = calculateCalibratedTDS(filteredTds, tempC);
    float turb = calculateCalibratedTurbidity(filteredTurb);

    // 6. Update global shared state safely
    if (xSemaphoreTake(g_stateMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
      g_sensors.ph = ph;
      g_sensors.tds = tds;
      g_sensors.turbidity = turb;
      g_sensors.temperature = tempC;
      g_sensors.flowRateLpm = flowLpm;
      g_sensors.rawAdcPh = avgRawPh;
      g_sensors.rawAdcTds = avgRawTds;
      g_sensors.rawAdcTurb = avgRawTurb;
      xSemaphoreGive(g_stateMutex);
    }

    vTaskDelayUntil(&xLastWakeTime, xFrequency);
  }
}

/**
 * Task 2: State Controller & Actuator Task (Pinned to Core 1, 10Hz / 100ms)
 * Implements the IS 10500:2012 comparator and drives relays.
 */
void TaskStateController(void *pvParameters) {
  TickType_t xLastWakeTime = xTaskGetTickCount();
  const TickType_t xFrequency = pdMS_TO_TICKS(100);

  for (;;) {
    SensorReadings currentData;
    if (xSemaphoreTake(g_stateMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
      currentData = g_sensors;
      xSemaphoreGive(g_stateMutex);
    }

    // Step A: Water Quality Classification (IS 10500:2012)
    SystemHealth health = HEALTH_SAFE;
    
    // Check pH Limits
    if (currentData.ph < IS_PH_MIN_ACCEPTABLE || currentData.ph > IS_PH_MAX_ACCEPTABLE) {
      if (currentData.ph < 5.5f || currentData.ph > 9.5f) {
        health = HEALTH_CRITICAL;
      } else if (health != HEALTH_CRITICAL) {
        health = HEALTH_WARNING;
      }
    }

    // Check Turbidity Limits
    if (currentData.turbidity > IS_TURB_MAX_PERMISSIBLE) {
      health = HEALTH_CRITICAL;
    } else if (currentData.turbidity > IS_TURB_MAX_ACCEPTABLE) {
      if (health != HEALTH_CRITICAL) health = HEALTH_WARNING;
    }

    // Check TDS Limits
    if (currentData.tds > IS_TDS_MAX_PERMISSIBLE) {
      health = HEALTH_CRITICAL;
    } else if (currentData.tds > IS_TDS_MAX_ACCEPTABLE) {
      if (health != HEALTH_CRITICAL) health = HEALTH_WARNING;
    }

    // Step B: Relay Dispatch Logic
    ActuatorStates relays;
    relays.sv1_inlet    = true; // Inlet always open to feed water
    relays.sv2_sediment = (currentData.turbidity > 1.0f); // Engage dual-media sand if turbid
    relays.sv3_targeted = (currentData.ph < 6.5f || currentData.ph > 8.5f); // Engage calcite/neutralizer if acid
    relays.sv4_carbon   = true; // Carbon polishing online
    relays.sv5_diverter = (health == HEALTH_CRITICAL); // Trip recirculation if severe

    // Write GPIO Outputs (Active HIGH with optocoupled relay board)
    digitalWrite(PIN_RELAY_SV1, relays.sv1_inlet ? HIGH : LOW);
    digitalWrite(PIN_RELAY_SV2, relays.sv2_sediment ? HIGH : LOW);
    digitalWrite(PIN_RELAY_SV3, relays.sv3_targeted ? HIGH : LOW);
    digitalWrite(PIN_RELAY_SV4, relays.sv4_carbon ? HIGH : LOW);
    digitalWrite(PIN_RELAY_SV5, relays.sv5_diverter ? HIGH : LOW);

    // RGB Status Indicator
    digitalWrite(PIN_LED_SAFE, (health == HEALTH_SAFE) ? HIGH : LOW);
    digitalWrite(PIN_LED_WARN, (health == HEALTH_WARNING) ? HIGH : LOW);
    digitalWrite(PIN_LED_CRIT, (health == HEALTH_CRITICAL) ? HIGH : LOW);

    // Update global state
    if (xSemaphoreTake(g_stateMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
      g_health = health;
      g_relays = relays;
      g_state = STATE_ACTUATION;
      xSemaphoreGive(g_stateMutex);
    }

    vTaskDelayUntil(&xLastWakeTime, xFrequency);
  }
}

/**
 * Task 3: Telemetry & Serial Logging Task (Pinned to Core 1, 1Hz)
 * Formats data for UART Serial Monitor and prepares JSON payloads.
 */
void TaskTelemetry(void *pvParameters) {
  for (;;) {
    SensorReadings s;
    ActuatorStates r;
    SystemHealth h;

    if (xSemaphoreTake(g_stateMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      s = g_sensors;
      r = g_relays;
      h = g_health;
      xSemaphoreGive(g_stateMutex);
    }

    const char *healthStr = (h == HEALTH_SAFE) ? "SAFE" : ((h == HEALTH_WARNING) ? "WARNING" : "CRITICAL");

    // Formatted Serial Stream for SIH Judges
    Serial.printf("[+%.1fs] [ADC_METRIC] pH_ADC:%d (%.2f pH) | TDS_ADC:%d (%.0f ppm) | TURB_ADC:%d (%.1f NTU) | T:%.1f°C\n",
      millis() / 1000.0f, s.rawAdcPh, s.ph, s.rawAdcTds, s.tds, s.rawAdcTurb, s.turbidity, s.temperature);

    Serial.printf("[+%.1fs] [FSM_STATE] Health: [%s] | Relays: [SV1:%d, SV2:%d, SV3:%d, SV4:%d, SV5:%d]\n",
      millis() / 1000.0f, healthStr, r.sv1_inlet, r.sv2_sediment, r.sv3_targeted, r.sv4_carbon, r.sv5_diverter);

    // Simulated IoT MQTT JSON packet
    Serial.printf("[+%.1fs] [MQTT_JSON] {\"device\":\"AQUA-JH01\",\"status\":\"%s\",\"ph\":%.2f,\"tds\":%.0f,\"turb\":%.1f}\n",
      millis() / 1000.0f, healthStr, s.ph, s.tds, s.turbidity);

    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

// ----------------------------------------------------------------------------
// SETUP & MAIN LOOP
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n=======================================================");
  Serial.println("  AquaSentinel - Embedded Water Quality Controller");
  Serial.println("  ESP32 FreeRTOS Dual-Core Firmware Initialized");
  Serial.println("  Target Region: Jharkhand Mining & Rural Belt");
  Serial.println("=======================================================\n");

  // Configure ADC (12-bit, 11dB attenuation for 0-3.3V range)
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  // Configure Relay Pins as Digital Outputs
  pinMode(PIN_RELAY_SV1, OUTPUT);
  pinMode(PIN_RELAY_SV2, OUTPUT);
  pinMode(PIN_RELAY_SV3, OUTPUT);
  pinMode(PIN_RELAY_SV4, OUTPUT);
  pinMode(PIN_RELAY_SV5, OUTPUT);

  // Status LEDs
  pinMode(PIN_LED_SAFE, OUTPUT);
  pinMode(PIN_LED_WARN, OUTPUT);
  pinMode(PIN_LED_CRIT, OUTPUT);

  // Flow Meter Pulse Counter Interrupt
  pinMode(PIN_FLOW_PULSE, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_FLOW_PULSE), flowPulseISR, RISING);

  // Initialize Temperature Bus
  tempSensors.begin();

  // Create Mutex for thread-safe state access
  g_stateMutex = xSemaphoreCreateMutex();

  // Spawn FreeRTOS Tasks across both ESP32 Xtensa LX6 Cores
  xTaskCreatePinnedToCore(TaskSensorAcquisition, "SensorTask",  4096, NULL, 2, NULL, 0); // Core 0
  xTaskCreatePinnedToCore(TaskStateController,   "ControlTask", 4096, NULL, 2, NULL, 1); // Core 1
  xTaskCreatePinnedToCore(TaskTelemetry,         "TelemTask",   4096, NULL, 1, NULL, 1); // Core 1

  Serial.println("[SYSTEM] All FreeRTOS tasks started successfully.");
}

void loop() {
  // FreeRTOS handles all tasks in background. Main loop stays empty or yields.
  vTaskDelay(pdMS_TO_TICKS(1000));
}
