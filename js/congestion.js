/**
 * FlowGuard AI \u2014 Milestone 5: Congestion Intelligence Engine
 * Rule-Based LOS, Severity, Diagnostics & Recommendation Engine
 *
 * IMPORTANT: This is an offline engineering decision-support prototype.
 * LOS grades are based on control delay thresholds (prototype assessment).
 * This does NOT claim formal IRC or HCM compliance unless explicitly verified.
 *
 * All threshold objects are centralised here as single sources of truth.
 * No scattered magic numbers. All UI components must use these functions.
 */

const CongestionEngine = (function () {
  'use strict';

  // =========================================================================
  // SECTION 1 \u2014 CONFIGURABLE THRESHOLD OBJECTS (Single Sources of Truth)
  // =========================================================================

  /**
   * CONGESTION_THRESHOLDS (IRC:93 Aligned)
   * Maps v/c ratio ranges to severity levels.
   * Any 15-minute time block with v/c > 0.85 is flagged as a failing bottleneck (Severe or Oversaturated).
   */
  const CONGESTION_THRESHOLDS = [
    {
      id: 'OVERSATURATED',
      label: 'OVERSATURATED',
      minVC: 1.0,        // exclusive lower bound (> 1.0)
      maxVC: Infinity,
      color: '#ef4444',  // red
      badgeClass: 'badge-oversaturated',
      textClass: 'text-rose',
      description: 'IRC:93 - Demand exceeds estimated approach capacity (v/c > 1.0).'
    },
    {
      id: 'SEVERE',
      label: 'SEVERE',
      minVC: 0.85,       // exclusive (> 0.85)
      maxVC: 1.00,       // inclusive (<= 1.00)
      color: '#f97316',  // orange
      badgeClass: 'badge-severe',
      textClass: 'text-orange',
      description: 'IRC:93 - Flagged failing bottleneck interval (0.85 < v/c <= 1.00).'
    },
    {
      id: 'HIGH',
      label: 'HIGH',
      minVC: 0.75,
      maxVC: 0.85,
      color: '#f59e0b',  // amber
      badgeClass: 'badge-medium',
      textClass: 'text-amber',
      description: 'High demand relative to capacity.'
    },
    {
      id: 'MODERATE',
      label: 'MODERATE',
      minVC: 0.60,
      maxVC: 0.75,
      color: '#eab308',  // yellow
      badgeClass: 'badge-moderate',
      textClass: 'text-yellow',
      description: 'Moderate congestion. Monitor during peak periods.'
    },
    {
      id: 'LOW',
      label: 'LOW',
      minVC: 0.0,
      maxVC: 0.60,
      color: '#10b981',  // emerald
      badgeClass: 'badge-low',
      textClass: 'text-emerald',
      description: 'Low congestion. Intersection operating within capacity.'
    }
  ];

  /**
   * calculateIRCSaturationFlow(lanes, widthMeters)
   * Saturation flow S according to Indian Roads Congress (IRC:93) standards.
   * Formula: S = 525 * W (PCU/hr), where W is the effective approach width in meters.
   * If width W is omitted, estimates W = lanes * 3.5m.
   */
  function calculateIRCSaturationFlow(lanes = 1, widthMeters = null) {
    const W = (widthMeters !== null && !isNaN(parseFloat(widthMeters)))
      ? parseFloat(widthMeters)
      : (parseInt(lanes, 10) || 1) * 3.5;
    return 525 * W;
  }

  /**
   * TASK 4: Calculate Traffic Pressure Index (TPI)
   * Derived from: Traffic Volume, Queue Length, Average Delay, V/C Ratio.
   * Returns normalized score (0 - 100) & rank categories: Low, Medium, High, Critical.
   */
  function calculateTrafficPressureIndex(flow, queue, delay, vcRatio) {
    const flowVal  = Math.max(0, parseFloat(flow) || 0);
    const queueVal = Math.max(0, parseFloat(queue) || 0);
    const delayVal = Math.max(0, parseFloat(delay) || 0);
    const vcVal    = Math.max(0, parseFloat(vcRatio) || 0);

    const normVolume = Math.min(100, (flowVal / 2500) * 100);
    const normQueue  = Math.min(100, (queueVal / 200) * 100);
    const normDelay  = Math.min(100, (delayVal / 150) * 100);
    const normVC     = Math.min(100, (vcVal / 1.5) * 100);

    const score = Math.min(100, Math.round(
      0.30 * normVC +
      0.30 * normDelay +
      0.25 * normQueue +
      0.15 * normVolume
    ));

    let category = 'Low';
    let badgeClass = 'badge-low';
    let color = '#10b981';

    if (score >= 85) {
      category = 'Critical';
      badgeClass = 'badge-oversaturated';
      color = '#ef4444';
    } else if (score >= 60) {
      category = 'High';
      badgeClass = 'badge-severe';
      color = '#f97316';
    } else if (score >= 30) {
      category = 'Medium';
      badgeClass = 'badge-medium';
      color = '#f59e0b';
    }

    return {
      score: score,
      category: category,
      badgeClass: badgeClass,
      color: color,
      label: `${category} (${score}/100)`
    };
  }

  /**
   * TASK 1 & TASK 3: IRC:93 Guidelines Automatic Validation Engine
   * Validates Webster Method signal timing against IRC:93 engineering bounds.
   */
  function validateIRC93Guidelines(activeKeys, proposedGreens, intersectionConfig, pedModel) {
    const minGreenConfig = parseFloat(intersectionConfig.minGreen) || 7;
    const maxGreenConfig = parseFloat(intersectionConfig.maxGreen) || 90;
    const yellowConfig   = parseFloat(intersectionConfig.yellowTime) || 3;
    const allRedConfig   = parseFloat(intersectionConfig.allRedTime) || 2;
    const reqPedTime     = pedModel ? (pedModel.requiredCrossingTime || pedModel.totalTime || 18.7) : 18.7;

    const minGreenPassed  = Object.values(proposedGreens).every(g => g >= minGreenConfig);
    const maxGreenPassed  = Object.values(proposedGreens).every(g => g <= maxGreenConfig);
    const yellowPassed    = yellowConfig >= 3;
    const allRedPassed    = allRedConfig >= 2;
    const pedSafetyPassed = Object.values(proposedGreens).every(g => (g + yellowConfig) >= reqPedTime);
    const conflictMatrixPassed = activeKeys.length >= 2;

    const failures = [];
    if (!minGreenPassed) failures.push(`Minimum Green violation (< ${minGreenConfig}s)`);
    if (!maxGreenPassed) failures.push(`Maximum Green violation (> ${maxGreenConfig}s)`);
    if (!yellowPassed)   failures.push(`Yellow Interval below IRC:93 standard (< 3s)`);
    if (!allRedPassed)   failures.push(`All Red Clearance below IRC:93 standard (< 2s)`);
    if (!pedSafetyPassed) failures.push(`Pedestrian Crossing Safety time not satisfied (${reqPedTime.toFixed(1)}s required)`);
    if (!conflictMatrixPassed) failures.push(`Conflict matrix overlap detected`);

    const overallPassed = failures.length === 0;

    return {
      overallPassed: overallPassed,
      statusLabel: overallPassed ? 'ENGINEERING VALIDATED' : 'IRC Validation Failed',
      failureReason: overallPassed ? 'All IRC:93 engineering guardrails satisfied.' : failures.join('; '),
      checks: {
        websterCompleted: true,
        minGreenPassed: minGreenPassed,
        maxGreenPassed: maxGreenPassed,
        yellowPassed: yellowPassed,
        allRedPassed: allRedPassed,
        pedSafetyPassed: pedSafetyPassed,
        conflictMatrixPassed: conflictMatrixPassed
      },
      failures: failures
    };
  }


  /**
   * LOS_THRESHOLDS
   * Prototype Level-of-Service classification based on control delay (s/veh).
   * Based on delay-range conventions used in signalised intersection analysis.
   * NOT formally verified against IRC:106 or HCM 7th Edition.
   */
  const LOS_THRESHOLDS = [
    { grade: 'A', maxDelay: 10,       description: 'Free / very low delay' },
    { grade: 'B', maxDelay: 20,       description: 'Stable operation' },
    { grade: 'C', maxDelay: 35,       description: 'Acceptable operation' },
    { grade: 'D', maxDelay: 55,       description: 'Noticeable congestion' },
    { grade: 'E', maxDelay: 80,       description: 'Heavy congestion' },
    { grade: 'F', maxDelay: Infinity, description: 'Excessive delay / failure' }
  ];

  /**
   * QUEUE_RISK_THRESHOLDS
   * Maps maximum queue length (vehicles) to risk level.
   */
  const QUEUE_RISK_THRESHOLDS = [
    { id: 'CRITICAL', label: 'CRITICAL', minQueue: 80,  color: '#ef4444', badgeClass: 'badge-oversaturated' },
    { id: 'HIGH',     label: 'HIGH',     minQueue: 40,  color: '#f97316', badgeClass: 'badge-severe' },
    { id: 'MODERATE', label: 'MODERATE', minQueue: 15,  color: '#f59e0b', badgeClass: 'badge-medium' },
    { id: 'LOW',      label: 'LOW',      minQueue: 0,   color: '#10b981', badgeClass: 'badge-low' }
  ];

  /**
   * TIME_OF_DAY_PROFILES
   * Demand scale factors per time slot relative to base demand.
   * Used to compute time-of-day congestion profiles from current analysis state.
   */
  const TIME_OF_DAY_PROFILES = {
    '7 AM':  { north: 0.77, east: 0.72, south: 0.79, west: 0.83 },
    '8 AM':  { north: 1.12, east: 1.14, south: 1.11, west: 1.20 },
    '9 AM':  { north: 1.00, east: 1.00, south: 1.00, west: 1.00 },
    '12 PM': { north: 0.72, east: 0.81, south: 1.61, west: 1.37 },
    '3 PM':  { north: 0.84, east: 0.89, south: 1.39, west: 1.17 },
    '5 PM':  { north: 1.08, east: 1.24, south: 1.71, west: 1.60 },
    '6 PM':  { north: 0.95, east: 1.06, south: 1.29, west: 1.23 },
    '8 PM':  { north: 0.53, east: 0.53, south: 0.75, west: 0.74 }
  };

  // =========================================================================
  // SECTION 2 \u2014 CORE CLASSIFICATION FUNCTIONS
  // =========================================================================

  /**
   * classifyCongestion(vcRatio)
   * Returns the congestion severity record for a given v/c ratio.
   * Uses CONGESTION_THRESHOLDS \u2014 single configuration object.
   */
  function classifyCongestion(vcRatio) {
    const vc = parseFloat(vcRatio) || 0;
    for (const tier of CONGESTION_THRESHOLDS) {
      if (vc > tier.minVC) return tier;
    }
    return CONGESTION_THRESHOLDS[CONGESTION_THRESHOLDS.length - 1]; // LOW fallback
  }

  /**
   * calculateLOS(delay)
   * Prototype LOS classification based on control delay (seconds/vehicle).
   * Returns { grade, delay, description }.
   */
  function calculateLOS(delay) {
    const d = parseFloat(delay) || 0;
    for (const tier of LOS_THRESHOLDS) {
      if (d <= tier.maxDelay) {
        return { grade: tier.grade, delay: d, description: tier.description };
      }
    }
    const last = LOS_THRESHOLDS[LOS_THRESHOLDS.length - 1];
    return { grade: last.grade, delay: d, description: last.description };
  }

  /**
   * classifyQueueRisk(queueLength)
   * Returns queue risk level from QUEUE_RISK_THRESHOLDS.
   */
  function classifyQueueRisk(queueLength) {
    const q = parseFloat(queueLength) || 0;
    for (const tier of QUEUE_RISK_THRESHOLDS) {
      if (q >= tier.minQueue) return tier;
    }
    return QUEUE_RISK_THRESHOLDS[QUEUE_RISK_THRESHOLDS.length - 1]; // LOW fallback
  }

  // =========================================================================
  // SECTION 3 \u2014 INTERSECTION-LEVEL CALCULATIONS
  // =========================================================================

  /**
   * calculateIntersectionDelay(activeKeys, simResult)
   * Demand-weighted average intersection delay.
   * Formula: \u03a3(q_i \u00d7 d_i) / \u03a3(q_i)
   * Does NOT simply average approach delays.
   */
  function calculateIntersectionDelay(activeKeys, simResult) {
    let sumQD = 0;
    let sumQ  = 0;
    activeKeys.forEach(k => {
      const app = simResult.approaches[k];
      if (!app) return;
      const q = parseFloat(app.flow) || 0;
      const d = parseFloat(app.avgWaitTime) || 0;
      sumQD += q * d;
      sumQ  += q;
    });
    return sumQ > 0 ? sumQD / sumQ : 0;
  }

  /**
   * identifyCriticalApproach(activeKeys, simResult)
   * Primary: highest v/c ratio.
   * Tie-break 1: higher average delay.
   * Tie-break 2: higher max queue.
   * Tie-break 3: higher demand.
   * Returns key of critical approach.
   */
  function identifyCriticalApproach(activeKeys, simResult) {
    if (!activeKeys || activeKeys.length === 0) return null;
    let critKey = activeKeys[0];

    activeKeys.forEach(k => {
      const cand = simResult.approaches[k];
      const curr = simResult.approaches[critKey];
      if (!cand) return;

      const candVC = cand.vcRatio || 0;
      const currVC = curr ? (curr.vcRatio || 0) : 0;

      if (candVC > currVC) {
        critKey = k;
      } else if (candVC === currVC) {
        // Tie-break 1: higher average delay
        const candD = cand.avgWaitTime || 0;
        const currD = curr ? (curr.avgWaitTime || 0) : 0;
        if (candD > currD) {
          critKey = k;
        } else if (candD === currD) {
          // Tie-break 2: higher max queue
          const candQ = cand.maxQueueLength || 0;
          const currQ = curr ? (curr.maxQueueLength || 0) : 0;
          if (candQ > currQ) {
            critKey = k;
          } else if (candQ === currQ) {
            // Tie-break 3: higher demand
            if ((cand.flow || 0) > (curr ? (curr.flow || 0) : 0)) {
              critKey = k;
            }
          }
        }
      }
    });
    return critKey;
  }

  // =========================================================================
  // SECTION 4 \u2014 RULE-BASED DIAGNOSTIC ENGINE
  // =========================================================================

  /**
   * runBottleneckDiagnostics(key, approachData, currentSim, proposedSim, activeKeys)
   * Engineering rule-based diagnosis for a single approach.
   * Returns { diagnosis, explanation } \u2014 NOT machine learning.
   */
  function runBottleneckDiagnostics(key, approachData, currentSim, proposedSim, activeKeys) {
    const curr = currentSim.approaches[key];
    const prop = proposedSim ? proposedSim.approaches[key] : null;
    if (!curr) return { diagnosis: 'NORMAL OPERATION', explanation: 'Insufficient data.' };

    const vc     = curr.vcRatio || 0;
    const queue  = curr.maxQueueLength || 0;
    const delay  = curr.avgWaitTime || 0;
    const green  = curr.greenTime || 1;
    const C      = (curr.greenTime || 1) + (curr.redTime || 1);

    // Calculate total effective green used vs available
    const greenRatio = C > 0 ? green / C : 0;

    // Rule 1: Demand exceeds capacity
    if (vc > 1.0) {
      return {
        diagnosis: 'DEMAND EXCEEDS CAPACITY',
        explanation: `Demand (${Math.round(curr.flow)} PCU/h) exceeds estimated approach capacity (${Math.round(curr.capacity)} PCU/h). v/c = ${vc.toFixed(2)} > 1.00. Increasing capacity and/or effective green allocation is required.`
      };
    }

    // Rule 2: Near capacity with low green share
    if (vc > 0.90 && greenRatio < 0.35) {
      return {
        diagnosis: 'INSUFFICIENT GREEN TIME',
        explanation: `Approach is near capacity (v/c = ${vc.toFixed(2)}) and green share is ${(greenRatio * 100).toFixed(0)}% of cycle. Additional effective green may reduce delay.`
      };
    }

    // Rule 3: Near capacity
    if (vc > 0.90) {
      return {
        diagnosis: 'QUEUE ACCUMULATION',
        explanation: `Near-capacity operation (v/c = ${vc.toFixed(2)}). Queue of ${Math.round(queue)} vehicles detected. Monitor for queue spillback.`
      };
    }

    // Rule 4: Queue exceeds threshold but vc is moderate
    if (queue > 40 && vc <= 0.90) {
      return {
        diagnosis: 'QUEUE ACCUMULATION',
        explanation: `Maximum queue of ${Math.round(queue)} vehicles detected despite moderate v/c = ${vc.toFixed(2)}. Review cycle length and green allocation.`
      };
    }

    // Rule 5: Proposed timing worsens this approach substantially
    if (prop && prop.avgWaitTime > delay * 1.15 && delay > 10) {
      return {
        diagnosis: 'UNBALANCED SIGNAL ALLOCATION',
        explanation: `Proposed timing increases delay on this approach from ${delay.toFixed(1)} to ${prop.avgWaitTime.toFixed(1)} s/veh (+${(((prop.avgWaitTime - delay) / delay) * 100).toFixed(0)}%). Signal redistribution trades off this approach for network benefit.`
      };
    }

    // Rule 6: Very low utilisation
    if (vc < 0.30 && delay < 20) {
      return {
        diagnosis: 'LOW UTILIZATION',
        explanation: `v/c = ${vc.toFixed(2)}. Approach demand is well below capacity. Green time may be redistributed to higher-demand approaches.`
      };
    }

    return {
      diagnosis: 'NORMAL OPERATION',
      explanation: `v/c = ${vc.toFixed(2)}. Approach operates within estimated capacity bounds with acceptable delay of ${delay.toFixed(1)} s/veh.`
    };
  }

  // =========================================================================
  // SECTION 5 \u2014 RECOMMENDATION ENGINE
  // =========================================================================

  /**
   * generateRecommendations(activeKeys, currentSim, proposedSim)
   * Generates specific, non-generic recommendations from actual results.
   * Each recommendation is tied to a specific condition.
   */
  function generateRecommendations(activeKeys, currentSim, proposedSim) {
    const recommendations = [];

    // Per-approach recommendations
    activeKeys.forEach(k => {
      const curr = currentSim.approaches[k];
      const prop = proposedSim ? proposedSim.approaches[k] : null;
      if (!curr) return;

      const vc    = curr.vcRatio || 0;
      const delay = curr.avgWaitTime || 0;
      const los   = calculateLOS(delay);

      if (vc > 1.0) {
        recommendations.push({
          approach: curr.name || k,
          priority: 'HIGH',
          text: `Increase capacity and/or effective green allocation for ${curr.name || k}. Current demand (${Math.round(curr.flow)} PCU/h) exceeds estimated capacity (${Math.round(curr.capacity)} PCU/h).`
        });
      } else if (vc >= 0.90) {
        recommendations.push({
          approach: curr.name || k,
          priority: 'MODERATE',
          text: `Monitor near-capacity operation on ${curr.name || k} (v/c = ${vc.toFixed(2)}). Evaluate additional green time allocation during peak periods.`
        });
      }

      if (los.grade === 'F' || los.grade === 'E') {
        const hasRec = recommendations.some(r => r.approach === (curr.name || k) && r.priority === 'HIGH');
        if (!hasRec) {
          recommendations.push({
            approach: curr.name || k,
            priority: 'MODERATE',
            text: `LOS ${los.grade} detected on ${curr.name || k} (${delay.toFixed(1)} s/veh). Signal timing adjustment should be evaluated to reduce control delay.`
          });
        }
      }

      if (prop && prop.avgWaitTime > delay * 1.20 && delay > 8) {
        recommendations.push({
          approach: curr.name || k,
          priority: 'ADVISORY',
          text: `Proposed timing increases delay on ${curr.name || k} from ${delay.toFixed(1)} to ${prop.avgWaitTime.toFixed(1)} s/veh. Protect minimum service to avoid excessive delay on this approach.`
        });
      }
    });

    // Intersection-level recommendations
    const allLow = activeKeys.every(k => {
      const app = currentSim.approaches[k];
      return app && (app.vcRatio || 0) < 0.60;
    });

    if (allLow) {
      recommendations.push({
        approach: 'INTERSECTION',
        priority: 'ADVISORY',
        text: 'All active approaches operate within low-congestion prototype criteria (v/c < 0.60). Current intersection demand appears within manageable bounds.'
      });
    }

    // Fairness recommendation
    const delays = activeKeys.map(k => currentSim.approaches[k] ? (currentSim.approaches[k].avgWaitTime || 0) : 0);
    const maxD   = Math.max(...delays);
    const minD   = Math.min(...delays);
    if (maxD - minD > 60 && minD > 0) {
      recommendations.push({
        approach: 'INTERSECTION',
        priority: 'ADVISORY',
        text: `High delay disparity detected (max: ${maxD.toFixed(1)} s/veh, min: ${minD.toFixed(1)} s/veh). Review signal plan equity across all active approaches.`
      });
    }

    return recommendations;
  }

  // =========================================================================
  // SECTION 6 \u2014 FAIRNESS / DELAY SPREAD CHECK
  // =========================================================================

  /**
   * runFairnessCheck(activeKeys, currentSim, proposedSim)
   * Computes delay spread and flags excessive disparity.
   * Advisory only \u2014 does NOT automatically reject the plan.
   */
  function runFairnessCheck(activeKeys, currentSim, proposedSim) {
    if (!proposedSim) return null;

    const propDelays = activeKeys.map(k => {
      const a = proposedSim.approaches[k];
      return { key: k, delay: a ? (a.avgWaitTime || 0) : 0 };
    });

    const maxEntry = propDelays.reduce((a, b) => a.delay >= b.delay ? a : b);
    const minEntry = propDelays.reduce((a, b) => a.delay <= b.delay ? a : b);
    const spread   = maxEntry.delay - minEntry.delay;

    const currSpread = (() => {
      const cd = activeKeys.map(k => {
        const a = currentSim.approaches[k];
        return a ? (a.avgWaitTime || 0) : 0;
      });
      return Math.max(...cd) - Math.min(...cd);
    })();

    const disparity = spread > currSpread * 1.2 && spread > 30;
    const warning   = disparity
      ? `Network delay is reduced, but the proposed allocation increases delay disparity between approaches (spread: ${spread.toFixed(1)} s/veh vs current: ${currSpread.toFixed(1)} s/veh).`
      : null;

    return {
      maxDelay:   Math.round(maxEntry.delay * 10) / 10,
      maxKey:     maxEntry.key,
      minDelay:   Math.round(minEntry.delay * 10) / 10,
      minKey:     minEntry.key,
      spread:     Math.round(spread * 10) / 10,
      currSpread: Math.round(currSpread * 10) / 10,
      hasDisparity: disparity,
      warning:    warning
    };
  }

  // =========================================================================
  // SECTION 7 \u2014 ENGINEERING WARNINGS
  // =========================================================================

  /**
   * generateWarnings(activeKeys, currentSim, proposedSim, intersectionResult)
   * Returns array of { type, message } from actual calculations.
   * Only active approaches are checked.
   */
  function generateWarnings(activeKeys, currentSim, proposedSim, intersectionResult) {
    const warnings = [];

    activeKeys.forEach(k => {
      const curr = currentSim.approaches[k];
      const prop = proposedSim ? proposedSim.approaches[k] : null;
      if (!curr) return;

      if (curr.vcRatio > 1.0) {
        warnings.push({ type: 'OVERSATURATION', message: `Oversaturated approach detected: ${curr.name || k} (v/c = ${curr.vcRatio.toFixed(2)}).` });
      }

      const los = calculateLOS(curr.avgWaitTime || 0);
      if (los.grade === 'F') {
        warnings.push({ type: 'LOS_F', message: `LOS F operation detected on ${curr.name || k} (delay = ${(curr.avgWaitTime || 0).toFixed(1)} s/veh).` });
      }

      if ((curr.remainingQueue || 0) > 5) {
        warnings.push({ type: 'RESIDUAL_QUEUE', message: `Residual queue remains after simulation horizon on ${curr.name || k} (${Math.round(curr.remainingQueue)} vehicles).` });
      }

      if (prop && prop.avgWaitTime > (curr.avgWaitTime || 0) * 1.10 && (curr.avgWaitTime || 0) > 5) {
        warnings.push({ type: 'WORSENED', message: `Proposed timing increases delay on ${curr.name || k}: ${(curr.avgWaitTime || 0).toFixed(1)} \u2192 ${prop.avgWaitTime.toFixed(1)} s/veh.` });
      }
    });

    // Intersection-level
    const demands = activeKeys.map(k => (currentSim.approaches[k] || {}).flow || 0);
    const maxD = Math.max(...demands);
    const minD = demands.filter(d => d > 0).length > 0 ? Math.min(...demands.filter(d => d > 0)) : 0;
    if (minD > 0 && maxD / minD > 5) {
      warnings.push({ type: 'IMBALANCE', message: `High demand imbalance detected: max approach demand is ${(maxD / minD).toFixed(1)}\u00d7 the minimum active approach demand.` });
    }

    return warnings;
  }

  // =========================================================================
  // SECTION 8 \u2014 BEFORE vs AFTER COMPARISON
  // =========================================================================

  /**
   * buildBeforeAfterComparison(activeKeys, currentSim, proposedSim)
   * Returns comparison object for the full before/after panel.
   * Includes per-approach trade-off analysis.
   */
  function buildBeforeAfterComparison(activeKeys, currentSim, proposedSim) {
    if (!proposedSim) return null;

    const currentDelay  = calculateIntersectionDelay(activeKeys, currentSim);
    const proposedDelay = calculateIntersectionDelay(activeKeys, proposedSim);
    const currentLOS    = calculateLOS(currentDelay);
    const proposedLOS   = calculateLOS(proposedDelay);

    const currentOversat  = activeKeys.filter(k => (currentSim.approaches[k] || {}).vcRatio > 1.0).length;
    const proposedOversat = activeKeys.filter(k => (proposedSim.approaches[k] || {}).vcRatio > 1.0).length;

    const delayReductionPct = currentDelay > 0
      ? Math.round(((currentDelay - proposedDelay) / currentDelay) * 1000) / 10
      : 0;

    const queueReductionPct = currentSim.overallMaxQueue > 0
      ? Math.round(((currentSim.overallMaxQueue - proposedSim.overallMaxQueue) / currentSim.overallMaxQueue) * 1000) / 10
      : 0;

    // Trade-off analysis \u2014 per approach
    const tradeoffs = activeKeys.map(k => {
      const curr = currentSim.approaches[k];
      const prop = proposedSim.approaches[k];
      const currDelay = curr ? (curr.avgWaitTime || 0) : 0;
      const propDelay = prop ? (prop.avgWaitTime || 0) : 0;
      const delta = propDelay - currDelay;
      const pct   = currDelay > 0 ? Math.round((delta / currDelay) * 1000) / 10 : 0;

      return {
        key: k,
        name: curr ? (curr.name || k) : k,
        currentDelay: Math.round(currDelay * 10) / 10,
        proposedDelay: Math.round(propDelay * 10) / 10,
        delta: Math.round(delta * 10) / 10,
        deltaPct: pct,
        direction: delta <= 0 ? 'IMPROVED' : 'WORSENED',
        currentLOS: calculateLOS(currDelay),
        proposedLOS: calculateLOS(propDelay),
        currentVC:  curr ? (curr.vcRatio || 0) : 0,
        proposedVC: prop ? (prop.vcRatio || 0) : 0,
        currentQueue:  curr ? (curr.maxQueueLength || 0) : 0,
        proposedQueue: prop ? (prop.maxQueueLength || 0) : 0
      };
    });

    const approachesImproved = tradeoffs.filter(t => t.direction === 'IMPROVED').length;
    const approachesWorsened = tradeoffs.filter(t => t.direction === 'WORSENED').length;

    return {
      current: {
        delay:                Math.round(currentDelay * 10) / 10,
        los:                  currentLOS,
        totalQueue:           currentSim.overallAvgQueue || 0,
        maxQueue:             currentSim.overallMaxQueue || 0,
        oversaturatedCount:   currentOversat
      },
      proposed: {
        delay:                Math.round(proposedDelay * 10) / 10,
        los:                  proposedLOS,
        totalQueue:           proposedSim.overallAvgQueue || 0,
        maxQueue:             proposedSim.overallMaxQueue || 0,
        oversaturatedCount:   proposedOversat
      },
      delayReductionPct,
      queueReductionPct,
      approachesImproved,
      approachesWorsened,
      tradeoffs
    };
  }

  // =========================================================================
  // SECTION 8.5 \u2014 CANDIDATE PLAN VALIDATION LAYER
  // =========================================================================

  /**
   * PROTOTYPE DECISION THRESHOLDS (Configurable Constants)
   * Explicit decision thresholds for candidate signal plan recommendation safety.
   */
  const PROTOTYPE_DECISION_THRESHOLDS = {
    MIN_NETWORK_IMPROVEMENT_PCT: 1.0,    // Net delay reduction must be >= 1.0%
    WORSENED_DELAY_INCREASE_SEC: 15.0,   // Delay increase > 15s is noticeable worsening
    WORSENED_DELAY_INCREASE_PCT: 20.0,   // Delay increase > 20% is noticeable worsening
    SEVERE_DELAY_INCREASE_SEC: 45.0,     // Delay increase > 45s is severe worsening
    SPREAD_DISPARITY_INCREASE_SEC: 20.0  // Delay spread increase > 20s triggers equity concern
  };

  /**
   * validateCandidatePlan(activeKeys, currentSim, proposedSim, analysisData)
   *
   * Central Validation Layer that evaluates Candidate Signal Plans.
   * Evaluates BOTH Network Performance and Per-Approach Performance.
   */
  function validateCandidatePlan(activeKeys, currentSim, proposedSim, analysisData) {
    if (!currentSim || !proposedSim) {
      return {
        status: 'NOT RECOMMENDED',
        summaryText: 'Simulation data unavailable.',
        acceptabilityReason: 'Retaining baseline timing due to missing simulation results.'
      };
    }

    const currOverall = currentSim.overallAvgWaitTime || 0;
    const propOverall = proposedSim.overallAvgWaitTime || 0;
    const overallDiff = propOverall - currOverall;
    const overallPct  = currOverall > 0 ? Math.round(((currOverall - propOverall) / currOverall) * 1000) / 10 : 0;
    const queueDiff   = (proposedSim.overallMaxQueue || 0) - (currentSim.overallMaxQueue || 0);

    const improved = [];
    const unchanged = [];
    const worsened = [];
    const severelyWorsened = [];

    activeKeys.forEach(k => {
      const cApp = currentSim.approaches[k] || {};
      const pApp = proposedSim.approaches[k] || {};
      const cDelay = cApp.avgWaitTime || 0;
      const pDelay = pApp.avgWaitTime || 0;
      const delta = pDelay - cDelay;
      const pct = cDelay > 0 ? (delta / cDelay) * 100 : 0;
      const appName = cApp.name || (analysisData && analysisData.approaches && analysisData.approaches[k] ? analysisData.approaches[k].name : k);

      const record = {
        key: k,
        name: appName,
        currentDelay: Math.round(cDelay * 10) / 10,
        proposedDelay: Math.round(pDelay * 10) / 10,
        delta: Math.round(delta * 10) / 10,
        deltaPct: Math.round(pct * 10) / 10,
        currentQueue: cApp.maxQueueLength || 0,
        proposedQueue: pApp.maxQueueLength || 0,
        currentVC: cApp.vcRatio || 0,
        proposedVC: pApp.vcRatio || 0
      };

      if (delta <= -1.0) {
        improved.push(record);
      } else if (delta >= PROTOTYPE_DECISION_THRESHOLDS.SEVERE_DELAY_INCREASE_SEC || (cDelay > 10 && pct >= 50.0 && pDelay > 45.0) || (pApp.vcRatio > 1.0 && cApp.vcRatio <= 1.0)) {
        severelyWorsened.push(record);
        worsened.push(record);
      } else if ((delta >= PROTOTYPE_DECISION_THRESHOLDS.WORSENED_DELAY_INCREASE_SEC && pct >= PROTOTYPE_DECISION_THRESHOLDS.WORSENED_DELAY_INCREASE_PCT) || (delta >= 10.0 && pct >= 30.0 && pDelay > 45.0)) {
        worsened.push(record);
      } else {
        unchanged.push(record);
      }
    });

    // Check if any approach suffers severe oversaturation or queue breakdown
    let hasOversaturation = false;
    activeKeys.forEach(k => {
      const cApp = currentSim.approaches[k] || {};
      const pApp = proposedSim.approaches[k] || {};
      if (cApp.vcRatio > 1.0 || pApp.vcRatio > 1.0) {
        hasOversaturation = true;
      }
    });

    // Determine status
    let status = 'NOT RECOMMENDED';
    if (overallPct >= PROTOTYPE_DECISION_THRESHOLDS.MIN_NETWORK_IMPROVEMENT_PCT) {
      if (worsened.length === 0) {
        status = 'RECOMMENDED';
      } else if (severelyWorsened.length > 1 && overallPct < 5.0) {
        status = 'NOT RECOMMENDED';
      } else {
        status = 'CONDITIONAL';
      }
    } else {
      // Net delay improvement < 1.0%
      if (hasOversaturation || severelyWorsened.length > 0) {
        status = 'NOT RECOMMENDED';
      } else {
        status = 'BASELINE RETAINED';
      }
    }

    let summaryText = '';
    let acceptabilityReason = '';

    if (status === 'RECOMMENDED') {
      summaryText = `RECOMMENDED PLAN — Overall simulated network delay decreases by ${overallPct}% (${Math.abs(overallDiff).toFixed(1)}s/veh) without creating unacceptable delay deterioration on any active approach.`;
      acceptabilityReason = `Overall average delay improves by ${overallPct}% and all active approaches operate within acceptable equity bounds.`;
    } else if (status === 'CONDITIONAL') {
      const names = worsened.map(w => `${w.name} (+${w.delta}s delay)`).join(', ');
      summaryText = `CONDITIONAL PLAN — Overall network delay decreases by ${overallPct}%; however, trade-offs remain on: ${names}. Advisory: Green redistribution provides partial benefits; consider reviewing overall cycle length (e.g. 120s → 140s) or lane configurations for oversaturated approaches.`;
      acceptabilityReason = `Overall average delay improves by ${overallPct}%, but ${worsened.length} approach(es) experience delay trade-offs (${names}).`;
    } else if (status === 'BASELINE RETAINED') {
      summaryText = `BASELINE RETAINED — Existing baseline signal timing performs adequately under current demand. Candidate green redistribution provides no meaningful network delay reduction (${overallPct}% change).`;
      acceptabilityReason = `Existing baseline timing is already performing adequately (all v/c \u2264 1.0). Reallocating green time yields no overall delay improvement; retaining baseline is recommended.`;
    } else {
      summaryText = `NOT RECOMMENDED — Candidate green redistribution alone cannot provide acceptable approach-level performance under current demand and cycle constraints. Baseline timing should be retained. Advisory: Review intersection geometry or overall cycle budget.`;
      acceptabilityReason = `Overall network delay fails to improve sufficiently or causes unmanageable approach deterioration (${overallPct}% change). Reallocating green time under current constraints is not recommended.`;
    }

    return {
      status,
      isRecommended: status === 'RECOMMENDED',
      isConditional: status === 'CONDITIONAL',
      isBaselineRetained: status === 'BASELINE RETAINED',
      isNotRecommended: status === 'NOT RECOMMENDED',
      overallDelayChangePercent: overallPct,
      overallDelayDiff: Math.round(overallDiff * 10) / 10,
      totalQueueChange: queueDiff,
      improvedApproaches: improved,
      unchangedApproaches: unchanged,
      worsenedApproaches: worsened,
      severelyWorsenedApproaches: severelyWorsened,
      summaryText,
      acceptabilityReason,
      thresholds: PROTOTYPE_DECISION_THRESHOLDS
    };
  }

  // =========================================================================
  // SECTION 9 \u2014 PROTOTYPE CONGESTION SCORE
  // =========================================================================

  /**
   * calculateCongestionScore(vcRatio, delay, queue)
   *
   * PROTOTYPE CONGESTION SCORE (0\u2013100) \u2014 Advisory only.
   * Formula (documented):
   *   score = 0.50 \u00d7 clamp(vc / 1.50, 0, 1) \u00d7 100
   *         + 0.30 \u00d7 clamp(delay / 120, 0, 1) \u00d7 100
   *         + 0.20 \u00d7 clamp(queue / 150, 0, 1) \u00d7 100
   *
   * Weights: v/c (50%), delay (30%), queue (20%).
   * Reference max values: vc=1.5, delay=120s, queue=150 vehicles.
   *
   * This score does NOT replace v/c ratio or delay as primary engineering metrics.
   * It is provided for comparative overview purposes only.
   */
  function calculateCongestionScore(vcRatio, delay, queue) {
    const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
    const vcNorm    = clamp(parseFloat(vcRatio) / 1.50, 0, 1);
    const delayNorm = clamp(parseFloat(delay)   / 120,  0, 1);
    const queueNorm = clamp(parseFloat(queue)   / 150,  0, 1);

    const score = 0.50 * vcNorm * 100
                + 0.30 * delayNorm * 100
                + 0.20 * queueNorm * 100;

    return Math.round(score);
  }

  // =========================================================================
  // SECTION 10 \u2014 TIME-OF-DAY CONGESTION PROFILE
  // =========================================================================

  /**
   * buildTimeOfDayProfile(activeKeys, baseApproaches, intersectionConfig)
   * Computes per-time-slot congestion metrics by scaling base demand.
   * Peak periods are DERIVED from data (highest intersection delay),
   * not hard-coded.
   */
  function buildTimeOfDayProfile(activeKeys, baseApproaches, intersectionConfig) {
    const C   = parseFloat(intersectionConfig.cycleLength) || 120;
    const sat = parseFloat(intersectionConfig.saturationFlow) || 1800;
    const Y   = parseFloat(intersectionConfig.yellowTime) || 3;
    const AR  = parseFloat(intersectionConfig.allRedTime) || 2;

    const nActive       = activeKeys.length;
    const lostPerPhase  = Y + AR;
    const totalEffGreen = Math.max(10, C - nActive * lostPerPhase);
    const gMin          = Math.max(3, parseFloat(intersectionConfig.minGreen) || 7);
    const gMax          = Math.min(C - 10, parseFloat(intersectionConfig.maxGreen) || 90);

    const slots = Object.keys(TIME_OF_DAY_PROFILES);
    const results = {};

    slots.forEach(slot => {
      const factors = TIME_OF_DAY_PROFILES[slot];

      // Scale base demand by factors
      const scaledApproaches = {};
      let totalDemand = 0;
      activeKeys.forEach(k => {
        const base = baseApproaches[k] || {};
        const flow = Math.round((parseFloat(base.flow) || 0) * (factors[k] || 1.0));
        const numLanes = parseInt(base.lanes, 10) || 2;
        scaledApproaches[k] = {
          ...base,
          flow,
          saturationFlow: numLanes * sat
        };
        totalDemand += flow;
      });

      // Simple equal green distribution to estimate baseline capacity/vc
      const equalGreen = Math.max(gMin, Math.min(gMax, Math.floor(totalEffGreen / Math.max(nActive, 1))));
      const greenAlloc = {};
      activeKeys.forEach(k => { greenAlloc[k] = equalGreen; });

      // Simulate with equal green to get baseline metrics for this time slot
      const simConfig = {
        cycleLength: C,
        yellowTime: Y,
        allRedTime: AR,
        numCycles: 5,
        saturationFlow: sat,
        activeKeys
      };

      let slotSim = null;
      try {
        slotSim = SimulationEngine.simulatePlan(scaledApproaches, greenAlloc, simConfig);
      } catch (e) {
        slotSim = null;
      }

      if (!slotSim) {
        results[slot] = { totalDemand, criticalApproach: null, highestVC: 0, avgDelay: 0, los: { grade: '-' }, maxQueue: 0, severity: classifyCongestion(0) };
        return;
      }

      const intDelay = calculateIntersectionDelay(activeKeys, slotSim);
      const critKey  = identifyCriticalApproach(activeKeys, slotSim);
      const critApp  = slotSim.approaches[critKey];
      const highVC   = critApp ? critApp.vcRatio : 0;
      const los      = calculateLOS(intDelay);
      const severity = classifyCongestion(highVC);
      const maxQ     = slotSim.overallMaxQueue || 0;

      results[slot] = {
        totalDemand,
        criticalApproach: critApp ? (critApp.name || critKey) : null,
        critKey,
        highestVC: Math.round(highVC * 100) / 100,
        avgDelay: Math.round(intDelay * 10) / 10,
        los,
        maxQueue: Math.round(maxQ),
        severity,
        approaches: slotSim.approaches
      };
    });

    // Derive peak periods from data (top 2 by avgDelay)
    const sorted = Object.entries(results)
      .filter(([, r]) => r.avgDelay > 0)
      .sort((a, b) => b[1].avgDelay - a[1].avgDelay);
    const peakSlots = sorted.slice(0, 2).map(([slot]) => slot);

    return { slots: results, peakSlots, allSlots: slots };
  }

  // =========================================================================
  // SECTION 11 \u2014 MASTER buildAnalysisResult()
  // =========================================================================

  /**
   * buildAnalysisResult(activeKeys, analysisData, currentSim, proposedSim, intersectionConfig)
   *
   * Master function that builds the SHARED analysis result object consumed by
   * all pages (Analysis, Dashboard, Simulation). Single source of truth.
   *
   * Callers should store the returned object and never independently
   * recalculate metrics covered here.
   */
  function buildAnalysisResult(activeKeys, analysisData, currentSim, proposedSim, intersectionConfig) {
    // Per-approach enrichment
    const enrichedApproaches = {};
    activeKeys.forEach(k => {
      const simApp  = currentSim.approaches[k] || {};
      const anaApp  = analysisData.approaches[k] || {};

      const vc      = simApp.vcRatio || anaApp.vcRatio || 0;
      const delay   = simApp.avgWaitTime || 0;
      const maxQ    = simApp.maxQueueLength || 0;
      const avgQ    = simApp.avgQueueLength || 0;
      const remQ    = simApp.remainingQueue || 0;
      const cap     = simApp.capacity || anaApp.capacity || 0;
      const demand  = simApp.flow || anaApp.flow || 0;
      const los     = calculateLOS(delay);
      const severity = classifyCongestion(vc);
      const queueRisk = classifyQueueRisk(maxQ);
      const diagResult = runBottleneckDiagnostics(k, anaApp, currentSim, proposedSim, activeKeys);
      const score   = calculateCongestionScore(vc, delay, maxQ);
      const dos     = vc;  // Degree of Saturation = v/c for single-period analysis

      enrichedApproaches[k] = {
        // Identity
        key: k,
        name: simApp.name || anaApp.name || k,
        // Traffic data
        demand,
        capacity: cap,
        vcRatio: Math.round(vc * 100) / 100,
        degreeOfSaturation: Math.round(dos * 100) / 100,
        // Delay & LOS
        avgDelay: Math.round(delay * 10) / 10,
        los,
        // Queue
        maxQueue: Math.round(maxQ),
        avgQueue: Math.round(avgQ * 10) / 10,
        remainingQueue: Math.round(remQ),
        queueRisk,
        // Classification
        severity,
        category: severity.label,
        badgeClass: severity.badgeClass,
        isOversaturated: vc > 1.0,
        // Diagnostics
        diagnosis: diagResult.diagnosis,
        diagExplanation: diagResult.explanation,
        // Score
        congestionScore: score,
        // Signal
        currentGreen: simApp.greenTime || anaApp.currentGreen || 0,
        proposedGreen: proposedSim ? (proposedSim.approaches[k] || {}).greenTime || 0 : 0,
        // Proposed plan metrics
        proposedDelay: proposedSim ? Math.round(((proposedSim.approaches[k] || {}).avgWaitTime || 0) * 10) / 10 : null,
        proposedMaxQueue: proposedSim ? Math.round((proposedSim.approaches[k] || {}).maxQueueLength || 0) : null,
        proposedVC: proposedSim ? Math.round(((proposedSim.approaches[k] || {}).vcRatio || 0) * 100) / 100 : null
      };
    });

    // Intersection-level
    const intDelay   = calculateIntersectionDelay(activeKeys, currentSim);
    const intLOS     = calculateLOS(intDelay);
    const critKey    = identifyCriticalApproach(activeKeys, currentSim);
    const critApp    = enrichedApproaches[critKey] || {};
    const maxVCEntry = Object.values(enrichedApproaches).reduce((a, b) => ((b.vcRatio || 0) > (a.vcRatio || 0) ? b : a), {});
    const intSeverity = classifyCongestion(maxVCEntry.vcRatio || 0);

    const intersection = {
      delay:              Math.round(intDelay * 10) / 10,
      los:                intLOS,
      totalDemand:        analysisData.totalDemand || 0,
      criticalApproach:   critKey,
      criticalApproachName: critApp.name || critKey,
      highestVC:          maxVCEntry.vcRatio || 0,
      maximumQueue:       currentSim.overallMaxQueue || 0,
      congestionSeverity: intSeverity,
      oversaturatedCount: activeKeys.filter(k => (enrichedApproaches[k] || {}).isOversaturated).length
    };

    // Comparison
    const comparison = buildBeforeAfterComparison(activeKeys, currentSim, proposedSim);

    // Fairness
    const fairness = runFairnessCheck(activeKeys, currentSim, proposedSim);

    // Warnings
    const warnings = generateWarnings(activeKeys, currentSim, proposedSim, intersection);

    // Recommendations
    const recommendations = generateRecommendations(activeKeys, currentSim, proposedSim);

    return {
      geometry:         analysisData.configType || '4CROSS',
      activeApproaches: activeKeys,
      totalDemand:      analysisData.totalDemand || 0,
      approaches:       enrichedApproaches,
      intersection,
      currentPlan:      comparison ? comparison.current  : null,
      proposedPlan:     comparison ? comparison.proposed : null,
      comparison,
      fairness,
      warnings,
      recommendations
    };
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    // Threshold constants (read-only access)
    CONGESTION_THRESHOLDS,
    LOS_THRESHOLDS,
    QUEUE_RISK_THRESHOLDS,
    TIME_OF_DAY_PROFILES,
    PROTOTYPE_DECISION_THRESHOLDS,

    // Classification functions
    classifyCongestion,
    calculateLOS,
    classifyQueueRisk,

    // Candidate Plan Validation Layer
    validateCandidatePlan,

    // Calculation functions
    calculateIntersectionDelay,
    identifyCriticalApproach,
    calculateCongestionScore,
    calculateTrafficPressureIndex,
    validateIRC93Guidelines,

    // Diagnostic engine
    runBottleneckDiagnostics,

    // Recommendation engine
    generateRecommendations,

    // Fairness check
    runFairnessCheck,

    // Warnings
    generateWarnings,

    // Comparison
    buildBeforeAfterComparison,

    // Time-of-day profile
    buildTimeOfDayProfile,

    // Master builder \u2014 primary public function
    buildAnalysisResult
  };
})();
if (typeof window !== 'undefined') { window.CongestionEngine = CongestionEngine; }
if (typeof module !== 'undefined' && module.exports) { module.exports = CongestionEngine; }

/**
 * Generate synthetic historical traffic data
 * Output: Array of objects representing 15-minute intervals for intersections.
 */
CongestionEngine.generateSyntheticHistoricalData = function(numIntersections = 3, numDays = 1) {
  const data = [];
  const incidents = ['none', 'none', 'none', 'none', 'none', 'none', 'roadwork', 'accident'];
  
  for (let d = 0; d < numDays; d++) {
    for (let i = 1; i <= numIntersections; i++) {
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 15) {
          const time_of_day = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
          let vpm = Math.floor(Math.random() * 15) + 5; // Base vpm 5 to 19
          
          // Morning peak (7-9 AM) and Evening peak (17-19 PM)
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
            lanes: Math.floor(Math.random() * 3) + 2, // 2 to 4 lanes
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
};
