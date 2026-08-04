/**
 * FlowGuard AI - Analytics Controller
 * Handles synthetic data generation, IRC:93 saturation flow math, v/c ratio calculations,
 * Webster's Optimum Cycle Length, Pedestrian Safety Guardrails, and Signal Timing Optimization.
 */

const CONGESTION_THRESHOLDS = [
  { id: 'OVERSATURATED', label: 'OVERSATURATED', minVC: 1.0, color: '#ef4444', badgeClass: 'badge-oversaturated', description: 'IRC:93 - Demand exceeds estimated approach capacity (v/c > 1.0).' },
  { id: 'SEVERE', label: 'SEVERE', minVC: 0.85, maxVC: 1.00, color: '#f97316', badgeClass: 'badge-severe', description: 'IRC:93 - Flagged failing bottleneck interval (0.85 < v/c <= 1.00).' },
  { id: 'HIGH', label: 'HIGH', minVC: 0.75, maxVC: 0.85, color: '#f59e0b', badgeClass: 'badge-medium', description: 'High demand relative to capacity.' },
  { id: 'MODERATE', label: 'MODERATE', minVC: 0.60, maxVC: 0.75, color: '#eab308', badgeClass: 'badge-moderate', description: 'Moderate congestion. Monitor during peak periods.' },
  { id: 'LOW', label: 'LOW', minVC: 0.0, maxVC: 0.60, color: '#10b981', badgeClass: 'badge-low', description: 'Low congestion. Operating within capacity.' }
];

const LOS_THRESHOLDS = [
  { grade: 'A', maxDelay: 10, description: 'Free / very low delay' },
  { grade: 'B', maxDelay: 20, description: 'Stable operation' },
  { grade: 'C', maxDelay: 35, description: 'Acceptable operation' },
  { grade: 'D', maxDelay: 55, description: 'Noticeable congestion' },
  { grade: 'E', maxDelay: 80, description: 'Heavy congestion' },
  { grade: 'F', maxDelay: Infinity, description: 'Excessive delay / failure' }
];

/**
 * Calculate Saturation Flow S according to Indian Roads Congress (IRC:93) standards.
 * Formula: S = 525 * W (PCU/hr), where W is effective approach width in meters.
 * If width W is omitted, estimates W = lanes * 3.5m.
 */
function calculateIRCSaturationFlow(lanes = 1, widthMeters = null) {
  const W = (widthMeters !== null && !isNaN(parseFloat(widthMeters))) 
    ? parseFloat(widthMeters) 
    : (parseInt(lanes, 10) || 1) * 3.5;
  return 525 * W;
}

/**
 * Minimum Pedestrian Green Safety Guardrail formula:
 * Tp = (W / 1.2) + 7 seconds
 * W: crossing width in meters, 1.2 m/s: walking speed, 7s: startup/clearance interval.
 */
function calculatePedestrianCrossingTime(crossingWidth = 14.0, walkingSpeed = 1.2, startUpTime = 7.0) {
  const W = parseFloat(crossingWidth) > 0 ? parseFloat(crossingWidth) : 14.0;
  const speed = parseFloat(walkingSpeed) > 0 ? parseFloat(walkingSpeed) : 1.2;
  const startup = parseFloat(startUpTime) >= 0 ? parseFloat(startUpTime) : 7.0;

  const walkTime = W / speed;
  const totalTime = startup + walkTime;
  
  return {
    crossingWidth: W,
    walkingSpeed: speed,
    startUpTime: startup,
    walkTime: parseFloat(walkTime.toFixed(1)),
    totalTime: parseFloat(totalTime.toFixed(1)),
    minPedGreenCeil: Math.ceil(totalTime)
  };
}

/**
 * Webster's Formula for Optimum Cycle Length:
 * C_opt = (1.5 * L + 5) / (1 - Y)
 * L: total lost time per cycle = sum(yellow + allRed)
 * Y: sum of critical flow ratios y_i = q_i / S_i
 */
function calculateWebsterOptimumCycle(approaches, lostTimePerPhase = 4, minCycle = 60, maxCycle = 180) {
  const keys = Object.keys(approaches);
  let sumCriticalY = 0;
  const flowRatios = {};

  keys.forEach((k) => {
    const app = approaches[k];
    const flow = parseFloat(app.flow || app.flowVehHr) || 0;
    const lanes = parseInt(app.lanes, 10) || 1;
    const satFlow = parseFloat(app.satFlow) || calculateIRCSaturationFlow(lanes, app.widthMeters);
    const y_i = satFlow > 0 ? (flow / satFlow) : 0;
    
    flowRatios[k] = parseFloat(y_i.toFixed(4));
    sumCriticalY += y_i;
  });

  const L = lostTimePerPhase * keys.length;
  let cOpt = 120;

  if (sumCriticalY < 1.0) {
    cOpt = (1.5 * L + 5) / (1 - sumCriticalY);
    cOpt = Math.min(maxCycle, Math.max(minCycle, Math.round(cOpt)));
  } else {
    cOpt = maxCycle; // Oversaturated network
  }

  return {
    totalLostTimeL: L,
    sumFlowRatiosY: parseFloat(sumCriticalY.toFixed(4)),
    flowRatios,
    websterOptimumCycle: cOpt,
    isOversaturated: sumCriticalY >= 1.0
  };
}

function classifyCongestion(vcRatio) {
  const vc = parseFloat(vcRatio) || 0;
  for (const tier of CONGESTION_THRESHOLDS) {
    if (vc > tier.minVC) return tier;
  }
  return CONGESTION_THRESHOLDS[CONGESTION_THRESHOLDS.length - 1];
}

function generateSyntheticData(numIntersections = 3, numDays = 1) {
  const data = [];
  const incidents = ['none', 'none', 'none', 'none', 'none', 'none', 'roadwork', 'accident'];
  
  for (let d = 0; d < numDays; d++) {
    for (let i = 1; i <= numIntersections; i++) {
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 15) {
          const time_of_day = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
          let vpm = Math.floor(Math.random() * 15) + 5;
          const lanes = Math.floor(Math.random() * 3) + 2;
          const width_meters = lanes * 3.5;
          
          if ((h >= 7 && h <= 9) || (h >= 17 && h <= 19)) {
            vpm = Math.floor(vpm * (2.0 + Math.random()));
          }
          
          const incident_event = incidents[Math.floor(Math.random() * incidents.length)];
          let anomaly_multiplier = 1.0;
          if (incident_event === 'roadwork') {
            anomaly_multiplier = 1.3; // 1.3x volume spike for simulated roadwork event
            vpm = Math.floor(vpm * anomaly_multiplier);
          } else if (incident_event === 'accident') {
            anomaly_multiplier = 1.5; // 1.5x volume spike for simulated accident event
            vpm = Math.floor(vpm * anomaly_multiplier);
          }
          
          data.push({
            intersection_id: `INT-${i}`,
            date: `Day-${d+1}`,
            time_of_day: time_of_day,
            vehicles_per_minute: vpm,
            lanes: lanes,
            width_meters: width_meters,
            speed_limit: [30, 40, 50][Math.floor(Math.random() * 3)],
            turning_ratios: {
              left: parseFloat((Math.random() * 0.3).toFixed(2)),
              straight: parseFloat((Math.random() * 0.5 + 0.4).toFixed(2)),
              right: parseFloat((Math.random() * 0.2).toFixed(2))
            },
            incident_event: incident_event,
            anomaly_multiplier: anomaly_multiplier
          });

        }
      }
    }
  }
  return data;
}

exports.getSyntheticData = (req, res) => {
  try {
    const numIntersections = parseInt(req.query.numIntersections) || 3;
    const numDays = parseInt(req.query.numDays) || 1;
    const data = generateSyntheticData(numIntersections, numDays);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.analyzeTraffic = (req, res) => {
  try {
    const { trafficData, approaches, configType, cycleLength = 120 } = req.body;

    if (Array.isArray(trafficData)) {
      let maxVC = 0;
      let totalVPM = 0;
      let bottleneckRecord = null;
      const failingIntervals = [];

      const analyzed = trafficData.map((row) => {
        const vpm = parseFloat(row.vehicles_per_minute) || 0;
        const lanes = parseInt(row.lanes, 10) || 1;
        const widthMeters = row.width_meters || (lanes * 3.5);
        const flowVehHr = vpm * 60;
        
        const satFlowIRC = calculateIRCSaturationFlow(lanes, widthMeters);
        const greenRatio = row.green_ratio || 0.4;
        const capacityVehHr = satFlowIRC * greenRatio;
        const vcRatio = capacityVehHr > 0 ? parseFloat((flowVehHr / capacityVehHr).toFixed(2)) : 99;
        
        const isFailing = vcRatio > 0.85;
        const tier = classifyCongestion(vcRatio);

        totalVPM += vpm;
        if (vcRatio > maxVC) {
          maxVC = vcRatio;
          bottleneckRecord = { ...row, vcRatio, severity: tier.id, satFlowIRC, capacityVehHr };
        }

        const itemResult = {
          ...row,
          width_meters: widthMeters,
          satFlowIRC,
          flowVehHr,
          capacityVehHr: Math.round(capacityVehHr),
          vcRatio,
          isFailing,
          severity: tier.id,
          color: tier.color,
          description: tier.description
        };

        if (isFailing) failingIntervals.push(itemResult);

        return itemResult;
      });

      const avgVPM = trafficData.length > 0 ? (totalVPM / trafficData.length).toFixed(1) : 0;

      return res.json({
        success: true,
        summary: {
          totalRecords: trafficData.length,
          failingIntervalsCount: failingIntervals.length,
          avgVPM: parseFloat(avgVPM),
          maxVC,
          bottleneck: bottleneckRecord,
          overallSeverity: classifyCongestion(maxVC)
        },
        failingIntervals,
        data: analyzed
      });
    }

    if (approaches) {
      const keys = Object.keys(approaches);
      const results = {};
      let totalDemand = 0;
      let maxVC = 0;

      keys.forEach((key) => {
        const app = approaches[key];
        const flow = parseFloat(app.flow) || 0;
        const lanes = parseInt(app.lanes, 10) || 1;
        const widthMeters = app.widthMeters || (lanes * 3.5);
        
        const satFlow = app.satFlow || calculateIRCSaturationFlow(lanes, widthMeters);
        const greenTime = parseFloat(app.greenTime) || (cycleLength / keys.length);
        const capacity = satFlow * (greenTime / cycleLength);
        const vcRatio = capacity > 0 ? parseFloat((flow / capacity).toFixed(2)) : 99;
        const tier = classifyCongestion(vcRatio);

        if (vcRatio > maxVC) maxVC = vcRatio;
        totalDemand += flow;

        results[key] = {
          id: key,
          flow,
          lanes,
          widthMeters,
          satFlow,
          greenTime,
          capacity: Math.round(capacity),
          vcRatio,
          severity: tier.id,
          color: tier.color,
          isFailing: vcRatio > 0.85,
          isOversaturated: vcRatio > 1.0
        };
      });

      return res.json({
        success: true,
        summary: {
          totalDemand,
          maxVC,
          overallSeverity: classifyCongestion(maxVC)
        },
        approaches: results
      });
    }

    res.status(400).json({ success: false, error: 'Invalid payload. Provide trafficData array or approaches object.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/optimize
 * Evaluates bottlenecks, calculates Webster's Optimum Cycle, enforces Pedestrian Guardrail,
 * and outputs optimized green splits reallocated from under-utilized phases.
 */
exports.optimizeTimings = (req, res) => {
  try {
    const { approaches, config = {} } = req.body;

    if (!approaches || typeof approaches !== 'object') {
      return res.status(400).json({ success: false, error: 'Payload must contain approaches object.' });
    }

    const keys = Object.keys(approaches);
    const nActive = keys.length;
    const yellow = parseFloat(config.yellowTime) || 3;
    const allRed = parseFloat(config.allRedTime) || 2;
    const lostTimePerPhase = yellow + allRed;

    // 1. Webster's Optimum Cycle Length Calculation
    const webster = calculateWebsterOptimumCycle(approaches, lostTimePerPhase);

    // 2. Minimum Pedestrian Green Safety Guardrail (Tp = W/1.2 + 7)
    const pedGuardrail = calculatePedestrianCrossingTime(
      config.crossingWidth || 14.0,
      config.walkingSpeed || 1.2,
      config.startUpTime || 7.0
    );

    const gMin = Math.max(parseFloat(config.minGreen) || 7, pedGuardrail.minPedGreenCeil);
    const C = webster.websterOptimumCycle;
    const totalLostTime = lostTimePerPhase * nActive;
    const totalEffectiveGreen = Math.max(10, C - totalLostTime);

    // 3. Proportional Green Time Reallocation based on Critical Flow Ratios (y_i / Y)
    const optimizedGreens = {};
    let allocatedSum = 0;

    keys.forEach((k) => {
      const y_i = webster.flowRatios[k] || 0.1;
      const propGreen = (webster.sumFlowRatiosY > 0)
        ? Math.round((y_i / webster.sumFlowRatiosY) * totalEffectiveGreen)
        : Math.round(totalEffectiveGreen / nActive);

      // Enforce pedestrian safety & min/max green guardrails
      const guardedGreen = Math.max(gMin, Math.min(C - 10, propGreen));
      optimizedGreens[k] = guardedGreen;
      allocatedSum += guardedGreen;
    });

    res.json({
      success: true,
      optimization: {
        webster,
        pedGuardrail,
        effectiveGMin: gMin,
        cycleLengthC: C,
        totalEffectiveGreen,
        optimizedGreens
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
