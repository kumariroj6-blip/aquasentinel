/**
 * AquaSentinel - Water Treatment & Contaminant Physics Simulation Model
 *
 * Implements empirical mass-balance and reaction kinetics for multi-stage filtration:
 *  1. Stage 1: 50-Micron Pre-Strainer (Coarse suspended solids)
 *  2. Stage 2: Dual-Media Sand & Anthracite Filter (Fine turbidity & colloidal silt)
 *  3. Stage 3: Targeted Specialized Media:
 *      - Calcite / Corosex neutralization bed (Acid mine drainage pH buffering)
 *      - Activated Alumina bed (Fluoride ion-exchange adsorption)
 *      - Birm / Manganese Greensand (Catalytic Iron oxidation & precipitation)
 *      - Iron-oxide coated sand (Arsenic chemisorption)
 *  4. Stage 4: Granular Activated Carbon (GAC) & Ultrafiltration Polishing
 *
 * Computes Treated Water properties, removal efficiencies, and IS 10500:2012 compliance.
 */

class WaterPhysicsSimulation {
  constructor() {
    // Standard IS 10500:2012 Reference Limits for Compliance
    this.IS10500_LIMITS = {
      ph: { min: 6.5, max: 8.5, name: "pH value" },
      tds: { acceptable: 500, permissible: 2000, unit: "mg/L", name: "Total Dissolved Solids" },
      turbidity: { acceptable: 1.0, permissible: 5.0, unit: "NTU", name: "Turbidity" },
      fluoride: { acceptable: 1.0, permissible: 1.5, unit: "mg/L", name: "Fluoride" },
      iron: { acceptable: 0.3, permissible: 1.0, unit: "mg/L", name: "Total Iron" },
      arsenic: { acceptable: 0.01, permissible: 0.05, unit: "mg/L", name: "Arsenic" }
    };
  }

  /**
   * Simulate multi-stage physical and chemical treatment
   * @param {Object} rawInput - { ph, tds, turbidity, temperature, flow }
   * @param {Object} labProfile - { fluoride, iron, arsenic, sourceName }
   * @param {Object} relays - GPIO relay states from embedded controller
   */
  processFiltration(rawInput, labProfile, relays) {
    // Clone starting values
    let ph = rawInput.ph;
    let tds = rawInput.tds;
    let turbidity = rawInput.turbidity;
    let fluoride = (labProfile && labProfile.fluoride) ? labProfile.fluoride : 0.4;
    let iron = (labProfile && labProfile.iron) ? labProfile.iron : 0.1;
    let arsenic = (labProfile && labProfile.arsenic) ? labProfile.arsenic : 0.002;

    const stageResults = [];

    // -------------------------------------------------------------
    // STAGE 1: Coarse Mesh Strainer (50 micron)
    // Always passes if inlet valve SV1 (GPIO 18) is open
    // -------------------------------------------------------------
    if (relays[18]) {
      // Removes larger particulate suspended grit: ~30% - 40% of turbidity if high
      const turbReductionRatio = turbidity > 15.0 ? 0.35 : 0.15;
      const initialTurb = turbidity;
      turbidity = Math.max(0.5, turbidity * (1.0 - turbReductionRatio));

      stageResults.push({
        stage: 1,
        name: "Stage 1: 50-Micron Coarse Strainer",
        status: "ACTIVE",
        turbidity_out: turbidity,
        effect: `Removed coarse suspended grit & debris (-${(turbReductionRatio * 100).toFixed(0)}% turbidity: ${initialTurb.toFixed(1)} -> ${turbidity.toFixed(1)} NTU)`
      });
    } else {
      stageResults.push({ stage: 1, name: "Stage 1: Pre-Strainer", status: "BYPASSED" });
    }

    // -------------------------------------------------------------
    // STAGE 2: Dual-Media Sand & Anthracite Filter
    // Activated by SV2 (GPIO 19)
    // -------------------------------------------------------------
    if (relays[19]) {
      // Dual-media deep-bed filtration captures 85% - 93% of colloidal particles
      const initialTurb = turbidity;
      turbidity = Math.max(0.2, turbidity * 0.12); // ~88% reduction

      stageResults.push({
        stage: 2,
        name: "Stage 2: Dual-Media Sand & Anthracite Bed",
        status: "ACTIVE",
        turbidity_out: turbidity,
        effect: `Deep-bed filtration trapped colloidal silt & suspended matter (${initialTurb.toFixed(1)} -> ${turbidity.toFixed(1)} NTU)`
      });
    } else {
      stageResults.push({ stage: 2, name: "Stage 2: Sand/Anthracite Bed", status: "STANDBY" });
    }

    // -------------------------------------------------------------
    // STAGE 3: Targeted Chemical Media
    // Activated by SV3 (GPIO 21)
    // -------------------------------------------------------------
    if (relays[21]) {
      const actions = [];

      // 1. pH Neutralization (Calcite dissolution for Acid Mine Drainage)
      if (ph < 6.5) {
        const initialPh = ph;
        // Dissolves CaCO3: H+ + CaCO3 -> Ca2+ + HCO3-
        // Neutralizes pH to safe 7.2 - 7.5, slightly adds 35-50 ppm of dissolved Ca(HCO3)2
        ph = 7.25 + (Math.random() - 0.5) * 0.2;
        tds += 35; // Mineralization
        actions.push(`Calcite bed neutralized acidic AMD (${initialPh.toFixed(2)} -> ${ph.toFixed(2)} pH, +35 ppm Ca²⁺ buffer)`);
      } else if (ph > 8.5) {
        const initialPh = ph;
        ph = 7.6 + (Math.random() - 0.5) * 0.2;
        actions.push(`Mild acid resin buffered high alkaline water (${initialPh.toFixed(2)} -> ${ph.toFixed(2)} pH)`);
      }

      // 2. Fluoride Adsorption (Activated Alumina - Al2O3)
      if (fluoride > 1.0) {
        const initialF = fluoride;
        // Activated alumina achieves 75% to 85% removal efficiency
        fluoride = Math.max(0.25, fluoride * 0.20);
        actions.push(`Activated Alumina adsorbed fluoride ions (${initialF.toFixed(2)} -> ${fluoride.toFixed(2)} mg/L, 80% removal)`);
      }

      // 3. Iron Oxidation & Precipitation (Birm / Manganese Greensand)
      if (iron > 0.3) {
        const initialFe = iron;
        // Catalytic oxidation of Fe2+ to Fe3+ precipitate filtered out: 85% removal
        iron = Math.max(0.05, iron * 0.15);
        actions.push(`Birm catalytic media oxidized dissolved iron to precipitate (${initialFe.toFixed(2)} -> ${iron.toFixed(2)} mg/L, 85% removal)`);
      }

      // 4. Arsenic Chemisorption (Zero-Valent Iron / Iron-Oxide Coated Sand)
      if (arsenic > 0.01) {
        const initialAs = arsenic;
        arsenic = Math.max(0.003, arsenic * 0.15);
        actions.push(`Iron-oxide coated media chemisorbed arsenic ions (${initialAs.toFixed(3)} -> ${arsenic.toFixed(3)} mg/L, 85% removal)`);
      }

      stageResults.push({
        stage: 3,
        name: "Stage 3: Targeted Chemical Media Reactor",
        status: "ACTIVE",
        effect: actions.length > 0 ? actions.join(' | ') : "Targeted media online in standby standby/buffer mode."
      });
    } else {
      stageResults.push({ stage: 3, name: "Stage 3: Targeted Media", status: "STANDBY" });
    }

    // -------------------------------------------------------------
    // STAGE 4: Granular Activated Carbon (GAC) + Ultrafiltration Polishing
    // Activated by SV4 (GPIO 22)
    // -------------------------------------------------------------
    if (relays[22]) {
      // GAC adsorbs organic taste/odor, chlorine, residual heavy metal complexes
      // Also polishes turbidity down to sub-NTU levels (< 0.8 NTU)
      const initialTurb = turbidity;
      turbidity = Math.min(turbidity, 0.45 + Math.random() * 0.25);

      // GAC slightly polishes dissolved organics (-15% TDS)
      const initialTds = tds;
      tds = Math.max(80, Math.round(tds * 0.88));

      // Residual trace reduction
      iron = Number((iron * 0.7).toFixed(2));
      fluoride = Number((fluoride * 0.85).toFixed(2));

      stageResults.push({
        stage: 4,
        name: "Stage 4: Granular Activated Carbon (GAC) & Ultrafiltration Polisher",
        status: "ACTIVE",
        turbidity_out: turbidity,
        effect: `Carbon adsorption polished dissolved traces, color & odor. Turbidity: ${initialTurb.toFixed(1)} -> ${turbidity.toFixed(2)} NTU | TDS: ${initialTds} -> ${tds} ppm`
      });
    } else {
      stageResults.push({ stage: 4, name: "Stage 4: Carbon Polisher", status: "STANDBY" });
    }

    // Final Post-Treatment Values (Effluent)
    const treated = {
      ph: Number(ph.toFixed(2)),
      tds: Math.round(tds),
      turbidity: Number(turbidity.toFixed(2)),
      temperature: rawInput.temperature,
      fluoride: Number(fluoride.toFixed(2)),
      iron: Number(iron.toFixed(2)),
      arsenic: Number(arsenic.toFixed(3))
    };

    // Calculate Removal Efficiencies (%)
    const efficiencies = {
      turbidity: rawInput.turbidity > 0 ? Math.max(0, Math.round(((rawInput.turbidity - treated.turbidity) / rawInput.turbidity) * 100)) : 0,
      tds: rawInput.tds > treated.tds ? Math.round(((rawInput.tds - treated.tds) / rawInput.tds) * 100) : 0,
      fluoride: labProfile && labProfile.fluoride > 0 ? Math.max(0, Math.round(((labProfile.fluoride - treated.fluoride) / labProfile.fluoride) * 100)) : 0,
      iron: labProfile && labProfile.iron > 0 ? Math.max(0, Math.round(((labProfile.iron - treated.iron) / labProfile.iron) * 100)) : 0,
      arsenic: labProfile && labProfile.arsenic > 0 ? Math.max(0, Math.round(((labProfile.arsenic - treated.arsenic) / labProfile.arsenic) * 100)) : 0
    };

    // Evaluate Post-Treatment IS 10500:2012 Compliance
    const compliance = this.evaluateIS10500Compliance(treated);

    // Safety Interlock / Diverter Check
    const diverterTriggered = relays[23] === 1 || !compliance.overallPass;
    const finalDestination = diverterTriggered
      ? "RECIRCULATION_LOOP (Water held for secondary pass or reject drain)"
      : "SAFE_STORAGE_TANK (Potable water certified compliant with IS 10500:2012)";

    return {
      raw: rawInput,
      labRaw: labProfile,
      treated: treated,
      efficiencies: efficiencies,
      compliance: compliance,
      diverterActive: diverterTriggered,
      finalDestination: finalDestination,
      stageHistory: stageResults
    };
  }

  /**
   * Verify whether effluent parameters strictly satisfy IS 10500:2012
   */
  evaluateIS10500Compliance(sample) {
    const checks = {
      ph: {
        value: sample.ph,
        target: "6.5 - 8.5",
        status: sample.ph >= 6.5 && sample.ph <= 8.5 ? "PASS" : "FAIL"
      },
      tds: {
        value: sample.tds,
        target: "< 500 ppm (Permissible < 2000)",
        status: sample.tds <= 500 ? "PASS" : (sample.tds <= 2000 ? "PERMISSIBLE" : "FAIL")
      },
      turbidity: {
        value: sample.turbidity,
        target: "< 1.0 NTU (Permissible < 5.0)",
        status: sample.turbidity <= 1.0 ? "PASS" : (sample.turbidity <= 5.0 ? "PERMISSIBLE" : "FAIL")
      },
      fluoride: {
        value: sample.fluoride,
        target: "< 1.0 mg/L (Permissible < 1.5)",
        status: sample.fluoride <= 1.0 ? "PASS" : (sample.fluoride <= 1.5 ? "PERMISSIBLE" : "FAIL")
      },
      iron: {
        value: sample.iron,
        target: "< 0.3 mg/L (Permissible < 1.0)",
        status: sample.iron <= 0.3 ? "PASS" : (sample.iron <= 1.0 ? "PERMISSIBLE" : "FAIL")
      },
      arsenic: {
        value: sample.arsenic,
        target: "< 0.01 mg/L",
        status: sample.arsenic <= 0.01 ? "PASS" : (sample.arsenic <= 0.05 ? "PERMISSIBLE" : "FAIL")
      }
    };

    const overallPass = Object.values(checks).every(c => c.status === "PASS" || c.status === "PERMISSIBLE");
    return {
      checks,
      overallPass,
      rating: overallPass ? "IS 10500 COMPLIANT (DRINKABLE)" : "NON-COMPLIANT (REQUIRES RE-CIRCULATION)"
    };
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.WaterPhysicsSimulation = WaterPhysicsSimulation;
}
