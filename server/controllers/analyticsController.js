/**
 * FlowGuard AI - Analytics Controller
 * Handles synthetic data generation, v/c ratio calculations, and congestion classification.
 */

const CONGESTION_THRESHOLDS = [
  { id: 'OVERSATURATED', label: 'OVERSATURATED', minVC: 1.0, color: '#ef4444', description: 'Demand exceeds estimated approach capacity.' },
  { id: 'SEVERE', label: 'SEVERE', minVC: 0.90, color: '#f97316', description: 'Near-capacity operation. High risk of breakdown.' },
  { id: 'HIGH', label: 'HIGH', minVC: 0.80, color: '#f59e0b', description: 'High demand relative to capacity.' },
  { id: 'MODERATE', label: 'MODERATE', minVC: 0.60, color: '#eab308', description: 'Moderate congestion. Monitor during peak periods.' },
  { id: 'LOW', label: 'LOW', minVC: 0.0, color: '#10b981', description: 'Low congestion. Intersection operating within capacity.' }
];

const LOS_THRESHOLDS = [
  { grade: 'A', maxDelay: 10, description: 'Free / very low delay' },
  { grade: 'B', maxDelay: 20, description: 'Stable operation' },
  { grade: 'C', maxDelay: 35, description: 'Acceptable operation' },
  { grade: 'D', maxDelay: 55, description: 'Noticeable congestion' },
  { grade: 'E', maxDelay: 80, description: 'Heavy congestion' },
  { grade: 'F', maxDelay: Infinity, description: 'Excessive delay / failure' }
];

function classifyCongestion(vcRatio) {
  const vc = parseFloat(vcRatio) || 0;
  for (const tier of CONGESTION_THRESHOLDS) {
    if (vc > tier.minVC) return tier;
  }
  return CONGESTION_THRESHOLDS[CONGESTION_THRESHOLDS.length - 1];
}

function calculateLOS(delaySec) {
  const d = parseFloat(delaySec) || 0;
  for (const tier of LOS_THRESHOLDS) {
    if (d <= tier.maxDelay) {
      return { grade: tier.grade, delay: d, description: tier.description };
    }
  }
  const last = LOS_THRESHOLDS[LOS_THRESHOLDS.length - 1];
  return { grade: last.grade, delay: d, description: last.description };
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
          
          if ((h >= 7 && h <= 9) || (h >= 17 && h <= 19)) {
            vpm = Math.floor(vpm * (2.0 + Math.random()));
          }
          
          const incident_event = incidents[Math.floor(Math.random() * incidents.length)];
          if (incident_event !== 'none') {
            vpm = Math.floor(vpm * (1.5 + Math.random()));
          }
          
          data.push({
            intersection_id: `INT-${i}`,
            date: `Day-${d+1}`,
            time_of_day: time_of_day,
            vehicles_per_minute: vpm,
            lanes: Math.floor(Math.random() * 3) + 2,
            speed_limit: [30, 40, 50][Math.floor(Math.random() * 3)],
            turning_ratios: {
              left: parseFloat((Math.random() * 0.3).toFixed(2)),
              straight: parseFloat((Math.random() * 0.5 + 0.4).toFixed(2)),
              right: parseFloat((Math.random() * 0.2).toFixed(2))
            },
            incident_event: incident_event
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

    // Handle traffic array input (CSV rows or historical records)
    if (Array.isArray(trafficData)) {
      let maxVC = 0;
      let totalVPM = 0;
      let bottleneckRecord = null;

      const analyzed = trafficData.map((row) => {
        const vpm = parseFloat(row.vehicles_per_minute) || 0;
        const lanes = parseInt(row.lanes, 10) || 1;
        const flowVehHr = vpm * 60;
        const capacityVehHr = 1800 * lanes * 0.4; // Default ~40% green allocation
        const vcRatio = capacityVehHr > 0 ? parseFloat((flowVehHr / capacityVehHr).toFixed(2)) : 99;
        const tier = classifyCongestion(vcRatio);

        totalVPM += vpm;
        if (vcRatio > maxVC) {
          maxVC = vcRatio;
          bottleneckRecord = { ...row, vcRatio, severity: tier.id };
        }

        return {
          ...row,
          flowVehHr,
          capacityVehHr,
          vcRatio,
          severity: tier.id,
          color: tier.color,
          description: tier.description
        };
      });

      const avgVPM = trafficData.length > 0 ? (totalVPM / trafficData.length).toFixed(1) : 0;

      return res.json({
        success: true,
        summary: {
          totalRecords: trafficData.length,
          avgVPM: parseFloat(avgVC = avgVPM),
          maxVC,
          bottleneck: bottleneckRecord,
          overallSeverity: classifyCongestion(maxVC)
        },
        data: analyzed
      });
    }

    // Handle approach-based input (Intersection geometry & approach counts)
    if (approaches) {
      const keys = Object.keys(approaches);
      const results = {};
      let totalDemand = 0;
      let maxVC = 0;

      keys.forEach((key) => {
        const app = approaches[key];
        const flow = parseFloat(app.flow) || 0;
        const lanes = parseInt(app.lanes, 10) || 1;
        const satFlowPerLane = parseFloat(app.satFlowPerLane) || 1800;
        const satFlow = satFlowPerLane * lanes;
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
          satFlow,
          greenTime,
          capacity: Math.round(capacity),
          vcRatio,
          severity: tier.id,
          color: tier.color,
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
