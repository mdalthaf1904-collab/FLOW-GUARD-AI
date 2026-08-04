/**
 * FlowGuard AI - Simulation Controller
 * Implements deterministic D/D/1 arrival-discharge queuing theory model.
 * 
 * Mathematical Grounding:
 * - Arrival rate lambda = q / 3600 (veh/sec)
 * - Discharge service rate mu = s / 3600 (veh/sec during green)
 * - Max red-phase queue buildup Q = lambda * R
 * - Time to clear queue during green t_c = Q / (mu - lambda)
 */

function simulatePlan(approaches, greenAllocation, config = {}) {
  const C = parseFloat(config.cycleLength) || 120;
  const numCycles = parseInt(config.numCycles, 10) || 10;
  const defaultSatFlow = parseFloat(config.saturationFlow) || 1800; // pcu/hr/lane

  const keys = config.activeKeys || Object.keys(approaches);
  const approachResults = {};

  let grandTotalDelayVehSec = 0;
  let grandTotalArrivals = 0;
  let grandTotalServed = 0;
  let grandTotalRemaining = 0;
  let grandTotalMaxQueue = 0;
  let maxApproachWaitTime = 0;

  keys.forEach((k) => {
    const app = approaches[k] || { id: k, name: k, flow: 0 };
    const qVehHr = parseFloat(app.flow) || 0;
    const gSec = Math.max(1, parseFloat(greenAllocation[k]) || 1);
    const rSec = Math.max(0, C - gSec);
    const numLanes = parseInt(app.lanes, 10) || 1;

    const appSatFlow = parseFloat(app.saturationFlow);
    const satFlow = (!isNaN(appSatFlow) && appSatFlow > defaultSatFlow)
      ? appSatFlow
      : defaultSatFlow * numLanes;

    // D/D/1 Queuing Model Parameters
    const lambda = qVehHr / 3600; // Arrival rate (veh/sec)
    const mu = satFlow / 3600;    // Discharge service rate during green (veh/sec)
    const redQueueQ = lambda * rSec; // Q = lambda * R (max red-phase queue buildup)
    const timeToClearTc = (mu > lambda) ? (redQueueQ / (mu - lambda)) : Infinity; // t_c = Q / (mu - lambda)

    const capacityVehHr = satFlow * (gSec / C);
    const vcRatio = capacityVehHr > 0 ? qVehHr / capacityVehHr : 99;

    let currentQueue = 0;
    let maxQueueInSim = 0;
    let totalVehiclesServed = 0;
    let totalDelayVehSec = 0;
    let totalArrivals = 0;

    for (let c = 1; c <= numCycles; c++) {
      // Red Phase Accumulation
      const redArrivals = lambda * rSec;
      const queuePeak = currentQueue + redArrivals;
      if (queuePeak > maxQueueInSim) {
        maxQueueInSim = queuePeak;
      }

      const redDelay = 0.5 * rSec * (currentQueue + queuePeak);

      // Green Phase Discharge
      const maxDischargeCap = mu * gSec;
      const greenArrivals = lambda * gSec;
      const totalGreenDemand = queuePeak + greenArrivals;

      let greenDelay = 0;
      let queueEnd = 0;
      let servedInCycle = 0;

      if (totalGreenDemand <= maxDischargeCap && mu > lambda) {
        // Queue clears completely during green
        const tc = queuePeak / (mu - lambda);
        const validClearTime = Math.min(gSec, tc);
        greenDelay = 0.5 * queuePeak * validClearTime;
        queueEnd = 0;
        servedInCycle = totalGreenDemand;
      } else {
        // Queue does NOT clear (oversaturated green phase)
        servedInCycle = maxDischargeCap;
        queueEnd = Math.max(0, totalGreenDemand - maxDischargeCap);
        greenDelay = gSec * ((queuePeak + queueEnd) / 2);
      }

      totalVehiclesServed += servedInCycle;
      totalDelayVehSec += (redDelay + greenDelay);
      totalArrivals += (redArrivals + greenArrivals);
      currentQueue = queueEnd;
    }

    const avgQueue = (totalDelayVehSec / (numCycles * C));
    const avgWaitTimeSec = totalArrivals > 0 ? (totalDelayVehSec / totalArrivals) : 0;

    if (avgWaitTimeSec > maxApproachWaitTime) {
      maxApproachWaitTime = avgWaitTimeSec;
    }

    approachResults[k] = {
      id: app.id || k,
      name: app.name || k,
      flow: qVehHr,
      capacity: Math.round(capacityVehHr),
      vcRatio: Math.round(vcRatio * 100) / 100,
      isOversaturated: vcRatio > 1.0,
      greenTime: gSec,
      redTime: rSec,
      dd1_metrics: {
        lambda: parseFloat(lambda.toFixed(4)),
        mu: parseFloat(mu.toFixed(4)),
        redQueueQ: Math.round(redQueueQ),
        timeToClearTcSec: isFinite(timeToClearTc) ? parseFloat(timeToClearTc.toFixed(2)) : 'Oversaturated'
      },
      avgQueueLength: Math.round(avgQueue * 10) / 10,
      maxQueueLength: Math.round(maxQueueInSim),
      avgWaitTime: Math.round(avgWaitTimeSec * 10) / 10,
      vehiclesArrived: Math.round(totalArrivals),
      vehiclesServed: Math.round(totalVehiclesServed),
      remainingQueue: Math.round(currentQueue),
      totalDelaySec: totalDelayVehSec
    };

    grandTotalDelayVehSec += totalDelayVehSec;
    grandTotalArrivals += totalArrivals;
    grandTotalServed += totalVehiclesServed;
    grandTotalRemaining += currentQueue;
    if (maxQueueInSim > grandTotalMaxQueue) {
      grandTotalMaxQueue = maxQueueInSim;
    }
  });

  const overallAvgWait = grandTotalArrivals > 0 ? (grandTotalDelayVehSec / grandTotalArrivals) : 0;
  let sumAvgQueue = 0;
  keys.forEach((k) => { sumAvgQueue += approachResults[k].avgQueueLength; });
  const overallAvgQueue = keys.length > 0 ? sumAvgQueue / keys.length : 0;

  return {
    approaches: approachResults,
    activeKeys: keys,
    overallAvgWaitTime: Math.round(overallAvgWait * 10) / 10,
    overallMaxQueue: Math.round(grandTotalMaxQueue),
    overallAvgQueue: Math.round(overallAvgQueue * 10) / 10,
    maxApproachWaitTime: Math.round(maxApproachWaitTime * 10) / 10,
    totalArrivals: Math.round(grandTotalArrivals),
    totalServed: Math.round(grandTotalServed),
    totalRemaining: Math.round(grandTotalRemaining),
    totalSystemDelayVehSec: Math.round(grandTotalDelayVehSec)
  };
}

function comparePlans(approaches, currentGreens, candidateGreens, config = {}) {
  const currentSim = simulatePlan(approaches, currentGreens, config);
  const candidateSim = simulatePlan(approaches, candidateGreens, config);

  const isImproved = candidateSim.overallAvgWaitTime < currentSim.overallAvgWaitTime;

  const calcPct = (candVal, currVal) => {
    if (currVal === 0) return 0;
    return Math.round(((candVal - currVal) / currVal) * 1000) / 10;
  };

  return {
    current: currentSim,
    candidate: candidateSim,
    isImproved,
    acceptanceStatus: isImproved ? 'RECOMMENDED' : 'NO_IMPROVEMENT',
    metrics: {
      waitTimeDiff: Math.round((candidateSim.overallAvgWaitTime - currentSim.overallAvgWaitTime) * 10) / 10,
      waitTimePct: calcPct(candidateSim.overallAvgWaitTime, currentSim.overallAvgWaitTime),
      maxQueueDiff: Math.round(candidateSim.overallMaxQueue - currentSim.overallMaxQueue),
      maxQueuePct: calcPct(candidateSim.overallMaxQueue, currentSim.overallMaxQueue),
      avgQueueDiff: Math.round((candidateSim.overallAvgQueue - currentSim.overallAvgQueue) * 10) / 10,
      avgQueuePct: calcPct(candidateSim.overallAvgQueue, currentSim.overallAvgQueue),
      totalServedDiff: Math.round(candidateSim.totalServed - currentSim.totalServed),
      totalServedPct: calcPct(candidateSim.totalServed, currentSim.totalServed),
      remainingDiff: Math.round(candidateSim.totalRemaining - currentSim.totalRemaining),
      remainingPct: calcPct(candidateSim.totalRemaining, currentSim.totalRemaining),
      maxApproachWaitDiff: Math.round((candidateSim.maxApproachWaitTime - currentSim.maxApproachWaitTime) * 10) / 10,
      maxApproachWaitPct: calcPct(candidateSim.maxApproachWaitTime, currentSim.maxApproachWaitTime)
    }
  };
}

function calculateQueueMetrics(syntheticData, cycleLength, greenTime) {
  const flowVehHr = (syntheticData.vehicles_per_minute || 10) * 60;
  const numLanes = syntheticData.lanes || 2;
  const satFlow = 1800 * numLanes;

  const lambda = flowVehHr / 3600;
  const mu = satFlow / 3600;

  const redTime = Math.max(0, cycleLength - greenTime);
  const capacityVehHr = satFlow * (greenTime / cycleLength);
  const vcRatio = capacityVehHr > 0 ? flowVehHr / capacityVehHr : 99;

  const redQueueQ = lambda * redTime;
  const timeToClearTc = mu > lambda ? redQueueQ / (mu - lambda) : Infinity;
  let totalDelay = 0;
  let maxQueue = redQueueQ;

  if (mu > lambda && timeToClearTc <= greenTime) {
    totalDelay = (0.5 * redQueueQ * redTime) + (0.5 * redQueueQ * timeToClearTc);
  } else {
    let queueEnd = Math.max(0, redQueueQ + (lambda - mu) * greenTime);
    totalDelay = (0.5 * redQueueQ * redTime) + (greenTime * (redQueueQ + queueEnd) / 2);
    maxQueue = Math.max(redQueueQ, queueEnd);
  }

  const totalArrivals = lambda * cycleLength;
  const avgDelay = totalArrivals > 0 ? totalDelay / totalArrivals : 0;
  const avgQueue = totalDelay / cycleLength;

  return {
    flow_veh_hr: flowVehHr,
    capacity_veh_hr: Math.round(capacityVehHr),
    vc_ratio: parseFloat(vcRatio.toFixed(2)),
    dd1_metrics: {
      lambda: parseFloat(lambda.toFixed(4)),
      mu: parseFloat(mu.toFixed(4)),
      redQueueQ: Math.round(redQueueQ),
      timeToClearTcSec: isFinite(timeToClearTc) ? parseFloat(timeToClearTc.toFixed(2)) : 'Oversaturated'
    },
    max_queue_length: Math.round(maxQueue),
    avg_queue_length: parseFloat(avgQueue.toFixed(2)),
    avg_delay_sec: parseFloat(avgDelay.toFixed(2))
  };
}

exports.simulateTraffic = (req, res) => {
  try {
    const { approaches, greenAllocation, candidateGreens, syntheticData, cycleLength = 120, greenTime, currentTimings, adjustedTimings, config = {} } = req.body;

    // What-If scenario with synthetic data record
    if (syntheticData) {
      if (currentTimings && adjustedTimings) {
        const before = calculateQueueMetrics(syntheticData, currentTimings.cycleLength || cycleLength, currentTimings.greenSplit || 30);
        const after = calculateQueueMetrics(syntheticData, adjustedTimings.cycleLength || cycleLength, adjustedTimings.greenSplit || 40);
        const delayDiff = parseFloat((before.avg_delay_sec - after.avg_delay_sec).toFixed(2));
        
        return res.json({
          success: true,
          before_metrics: before,
          after_metrics: after,
          improvement_estimates: {
            delay_reduction_sec: delayDiff,
            delay_reduction_pct: before.avg_delay_sec > 0 ? parseFloat(((delayDiff / before.avg_delay_sec) * 100).toFixed(2)) : 0,
            queue_reduction: parseFloat((before.avg_queue_length - after.avg_queue_length).toFixed(2))
          }
        });
      }

      const metrics = calculateQueueMetrics(syntheticData, cycleLength, greenTime || 30);
      return res.json({ success: true, metrics });
    }

    // Comparison mode (current vs candidate timing plans)
    if (approaches && greenAllocation && candidateGreens) {
      const comparison = comparePlans(approaches, greenAllocation, candidateGreens, { cycleLength, ...config });
      return res.json({ success: true, ...comparison });
    }

    // Single plan simulation
    if (approaches && greenAllocation) {
      const simulation = simulatePlan(approaches, greenAllocation, { cycleLength, ...config });
      return res.json({ success: true, simulation });
    }

    res.status(400).json({ success: false, error: 'Invalid payload. Provide approaches & greenAllocation, or syntheticData.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
