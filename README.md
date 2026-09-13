# AquaSentinel — Embedded Water-Quality Monitoring & Contamination Prevention

> **Smart India Hackathon (SIH) Project**  
> **Domain:** Water Quality, Contamination Prevention & Embedded IoT Systems  
> **Regional Focus:** Rural & Mining-Affected Belts of Jharkhand (Dhanbad, Palamu, Chaibasa, Jaduguda)

---

## 1. Project Overview

**AquaSentinel** is an intelligent embedded water-quality monitoring and multi-stage preventive filtration system designed for rural communities and mining-affected regions in Jharkhand. 

In Jharkhand's mining belts, drinking water sources are severely impacted by:
* **Acid Mine Drainage (AMD):** Pyrite ($FeS_2$) oxidation leading to abnormally low pH ($< 4.0$) and dangerous heavy-mineral leaching.
* **Heavy Iron ($Fe$):** Leaching from iron-ore deposits and coal seams ($> 3.0$ mg/L), imparting rust color, metallic taste, and bacterial fouling.
* **Geogenic Fluoride ($F^-$):** Dissolution of fluoride-bearing minerals in deep granitic aquifers in Palamu/Garhwa ($> 3.5$ mg/L), causing severe dental and crippling skeletal fluorosis.
* **Severe Monsoon Turbidity:** High suspended colloidal silt ($> 80$ NTU) from opencast mining runoff washed into village ponds and rivers.
* **High Total Dissolved Solids (TDS):** Extreme mineral salinity in deep borewells.

AquaSentinel implements a **closed-loop embedded control architecture**:
$$\text{Water Input} \longrightarrow \text{Sensors} \longrightarrow \text{ESP32 Embedded Logic} \longrightarrow \text{IS 10500 Evaluation} \longrightarrow \text{Stage Dispatch} \longrightarrow \text{Post-Treatment Verification}$$

---

## 2. Quick Start: How to Run the Prototype

**Zero external dependencies, zero hardware, and no Wokwi account required.**

### Option A: Direct Browser Launch (Easiest)
1. Navigate to:  
   `C:\Users\LENOVO\.gemini\antigravity\scratch\aquasentinel\`
2. Double-click **`index.html`** to open it directly in Google Chrome, Microsoft Edge, or Mozilla Firefox.

### Option B: Local Web Server (Recommended for Best Performance)
Open PowerShell or Command Prompt in the project folder and run:
```powershell
# Using Python (built into Windows)
python -m http.server 8000
```
Then visit: `http://localhost:8000`

---

## 3. Folder Structure

```
aquasentinel/
├── index.html                   # Interactive SCADA Dashboard & P&ID Schematic
├── css/
│   └── styles.css               # Industrial dark-mode SCADA styling & animations
├── js/
│   ├── app.js                   # Master coordinator & Jharkhand preset scenario loader
│   ├── firmware_mcu.js          # ESP32 FreeRTOS firmware emulator (ADC, FSM, Relays)
│   ├── water_physics.js         # Empirical chemical & mass-balance filtration model
│   ├── pid_renderer.js          # SVG Piping & Instrumentation Diagram with animated flow
│   └── telemetry_charts.js      # Zero-dependency real-time Canvas strip-chart oscilloscope
├── firmware/
│   └── aquasentinel_esp32.ino   # Complete, ready-to-flash Arduino/ESP32 C++ firmware sketch
└── README.md                    # Project documentation & SIH presentation pitch guide
```

---

## 4. Embedded Engineering & Architecture Deep Dive

As a 2nd-year Electrical Engineering student, your contribution is demonstrated through concrete embedded systems concepts:

### 1. 12-Bit ADC Oversampling & Moving-Average Digital Filter
* **Hardware Challenge:** The internal ADC of the ESP32 (and standard analog sensors) suffers from high-frequency noise, Gaussian thermal jitter, and 50Hz mains power hum.
* **Firmware Solution:** The firmware samples the analog pins at 50Hz with **16x oversampling** and applies a sliding **Moving-Average Filter** ($N=10$):
  $$y[n] = \frac{1}{N} \sum_{k=0}^{N-1} x[n-k]$$
* This eliminates noise spikes before threshold evaluation.

### 2. Temperature Compensation (Nernst Equation & TDS Coefficient)
* **pH Sensor:** In cold or hot groundwater, the voltage output of glass pH electrodes drifts according to the Nernst relationship:
  $$E = E_0 - \frac{2.303 R T}{F} (pH - 7)$$
  Our firmware feeds the live temperature from the waterproof DS18B20 sensor into the Nernst equation to maintain measurement accuracy across $5^\circ\text{C}$ to $45^\circ\text{C}$.
* **TDS Sensor:** Electrical conductivity increases by $\approx 2.0\% \text{ per } ^\circ\text{C}$. The firmware compensates TDS to standard $25^\circ\text{C}$ reference:
  $$TDS_{25} = \frac{TDS_T}{1 + 0.02 \times (T - 25)}$$

### 3. Bureau of Indian Standards (IS 10500:2012) Rule Engine
Rather than using arbitrary thresholds, AquaSentinel evaluates against India's official drinking water standards:
* **pH:** Acceptable: $6.5 - 8.5$ (Permissible: No relaxation)
* **TDS:** Acceptable: $< 500$ mg/L (Permissible in absence of alternate source: $< 2000$ mg/L)
* **Turbidity:** Acceptable: $< 1.0$ NTU (Permissible: $< 5.0$ NTU)
* **Fluoride:** Acceptable: $< 1.0$ mg/L (Permissible: $< 1.5$ mg/L)
* **Iron:** Acceptable: $< 0.3$ mg/L (Permissible: $< 1.0$ mg/L)
* **Arsenic:** Acceptable: $< 0.01$ mg/L (Strict limit)

### 4. Finite State Machine (FSM) & Relay Actuation Logic
The ESP32 controller operates in distinct states:
* `STATE_BOOT` $\rightarrow$ `STATE_ACQUISITION` $\rightarrow$ `STATE_EVALUATION` $\rightarrow$ `STATE_STAGE_CONTROL` $\rightarrow$ `STATE_VERIFICATION`
* **Relay Actuators (GPIO 18 to 23):**
  * **Relay 1 (GPIO 18):** Controls Solenoid SV1 for raw water feed & 50-micron pre-strainer.
  * **Relay 2 (GPIO 19):** Engages Solenoid SV2 for the Dual-Media Sand/Anthracite Bed when Turbidity $> 1.0$ NTU.
  * **Relay 3 (GPIO 21):** Engages Solenoid SV3 to route through Targeted Chemical Media (Calcite neutralizer for low pH, Activated Alumina for Fluoride, or Birm media for Iron oxidation).
  * **Relay 4 (GPIO 22):** Engages Solenoid SV4 for Granular Activated Carbon (GAC) polishing.
  * **Relay 5 (GPIO 23):** Safety Diverter Solenoid SV5. If the post-treatment verification detects critical non-compliance, water is automatically diverted to a recirculation loop or reject drain.

---

## 5. Technical Honesty: Dual-Tier Contaminant Profiling

In SIH presentations, student teams often lose marks by claiming that cheap generic analog sensors can measure Arsenic or Fluoride directly. 

**AquaSentinel solves this with technical honesty:**
1. **Tier 1 (In-Situ Real-Time Sensors):** pH, TDS, Turbidity, Temperature, and Flow Rate are monitored continuously via physical sensors on the ESP32.
2. **Tier 2 (Geochemical / Field Lab Profile):** Because trace heavy minerals require specialized laboratory spectrophotometry or ion-selective electrodes (ISE), our system accepts official regional water-sample profiles (e.g., from the Central Ground Water Board or mobile field kits). 
3. **Automated Treatment Synergy:** When an anomaly is detected in Tier 1 (e.g. acidic pH and high conductivity from a Dhanbad coalfield), the system cross-references the regional profile and automatically engages the specific targeted chemical media (Calcite + Birm for AMD; Activated Alumina for Palamu aquifers).

---

## 6. How the Simulation Demonstrates AquaSentinel to SIH Judges

When demonstrating to judges:
1. **Step 1: Select "Scenario 1 (Clean Rural Well)"**:
   - Show that all sensor values are green.
   - The master status displays `SAFE - IS 10500 COMPLIANT`.
   - The P&ID shows only standard pre-filtration and carbon polishing active.
2. **Step 2: Select "Scenario 3 (Dhanbad Acid Mine Drainage)"**:
   - The raw water pH drops to `3.80`, TDS spikes to `1350 ppm`, and Iron is flagged.
   - The Virtual UART Terminal immediately prints `[ALARM_EVT] [CRITICAL] ERR_PH_ACIDIC`.
   - The ESP32 energizes GPIO 21 (SV3) and GPIO 19 (SV2).
   - In the P&ID diagram, the **Targeted Media Reactor** lights up yellow and water pulses through the neutralization stage.
   - The **Before vs After Table** shows:
     - Raw pH $3.80 \longrightarrow$ Treated pH $7.25$ (Calcite buffer)
     - Raw Turbidity $34.0 \text{ NTU} \longrightarrow$ Treated Turbidity $0.45 \text{ NTU}$ ($-98\%$ reduction)
     - Raw Iron $4.80 \text{ mg/L} \longrightarrow$ Treated Iron $0.08 \text{ mg/L}$ ($-85\%$ removal via catalytic oxidation)
3. **Step 3: Point to the Virtual UART Serial Terminal**:
   - Highlight the 115200-baud logs showing raw ADC counts, voltages, and simulated MQTT JSON payloads ready for cloud telemetry.
4. **Step 4: Use the Manual Sliders (Custom Sandbox Mode)**:
   - Move the pH slider below 5.0 or Turbidity above 80 NTU to show real-time reactive switching.

---

## 7. Physical Hardware Migration (SIH Round 2 Implementation)

When you receive funding or hardware components for Round 2, you can flash the included `firmware/aquasentinel_esp32.ino` directly onto an ESP32.

### Pinout Mapping:
| Sensor / Actuator | ESP32 GPIO | Description / Interface |
| :--- | :--- | :--- |
| **Analog pH Probe (DFRobot SEN0161)** | `GPIO 34` | ADC1_CH6 (Analog 0 to 3.3V) |
| **Analog TDS Meter V1.0** | `GPIO 35` | ADC1_CH7 (Analog 0 to 2.3V) |
| **Optical Turbidity Sensor (TS-300B)** | `GPIO 36` | ADC1_CH0 (SENSOR_VP) |
| **DS18B20 Temp Probe** | `GPIO 4` | Dallas 1-Wire with 4.7kΩ pull-up to 3.3V |
| **Flow Meter (YF-S201)** | `GPIO 16` | Hardware interrupt pulse counter |
| **Solenoid SV1 (Inlet / Pre-Strainer)** | `GPIO 18` | Relay 1 (Active HIGH via 5V optocoupled board) |
| **Solenoid SV2 (Sand / Anthracite Bed)**| `GPIO 19` | Relay 2 |
| **Solenoid SV3 (Targeted Media Reactor)**| `GPIO 21` | Relay 3 |
| **Solenoid SV4 (GAC Carbon Polisher)** | `GPIO 22` | Relay 4 |
| **Solenoid SV5 (Safety Diverter Valve)** | `GPIO 23` | Relay 5 |

### Hardware Safety Tips for Electrical Engineering Members:
1. **Flyback Diodes:** Wire a `1N4007` diode in reverse-bias across each 12V DC solenoid valve coil. When a relay turns off, the magnetic field in the solenoid collapses, creating a high-voltage inductive kick ($V = L \frac{di}{dt}$) that can destroy microcontrollers without flyback protection.
2. **Optocoupler Isolation:** Remove the `JD-VCC` jumper on the 5V relay board. Power the relay coils from a separate 5V power supply rail while powering the ESP32 from USB or a dedicated 3.3V/5V LDO regulator.
3. **Optional 16-bit ADC (ADS1115):** The internal ESP32 ADC has known non-linearities below 0.1V and above 3.1V. For industrial precision in Round 2, connect an external I2C `ADS1115` ADC to `GPIO 21 (SDA)` and `GPIO 22 (SCL)`.
