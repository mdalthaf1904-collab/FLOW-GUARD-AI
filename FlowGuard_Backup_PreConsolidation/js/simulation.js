/**
 * FlowGuard AI - Deterministic Queue Simulation Engine (Milestone 3 Dynamic Approaches)
 * Civil Engineering D/D/1 Arrival-Discharge Queuing Theory Model
 */

const SimulationEngine = (function() {
  'use strict';

  /**
   * Run Deterministic D/D/1 Queue Simulation for active approaches
   * 
   * @param {Object} approaches - Map of approach flows
   * @param {Object} greenAllocation - Map of green times per approach
   * @param {Object} config - { cycleLength, yellowTime, allRedTime, numCycles, saturationFlow, activeKeys }
   */
  function simulatePlan(approaches, greenAllocation, config) {
    const C = parseFloat(config.cycleLength) || 120;
    const numCycles = parseInt(config.numCycles, 10) || 10;
    const defaultSatFlow = parseFloat(config.saturationFlow) || 1800; // pcu/hr

    // Filter keys by activeKeys if provided, else take keys present in approaches
    const keys = config.activeKeys || Object.keys(approaches);
    const approachResults = {};

    let grandTotalDelayVehSec = 0;
    let grandTotalArrivals = 0;
    let grandTotalServed = 0;
    let grandTotalRemaining = 0;
    let grandTotalMaxQueue = 0;
    let maxApproachWaitTime = 0;

    keys.forEach(k => {
      const app = approaches[k] || { id: k, name: k, flow: 0 };
      const qVehHr = parseFloat(app.flow) || 0;
      const gSec = Math.max(1, parseFloat(greenAllocation[k]) || 1);
      const rSec = Math.max(0, C - gSec);
      const satFlow = parseFloat(app.saturationFlow) || defaultSatFlow;

      // Arrival rate lambda (veh/sec)
      const lambda = qVehHr / 3600;
      // Service discharge rate mu during green (veh/sec)
      const mu = satFlow / 3600;

      // Approach capacity per hour c_i = s * (g / C)
      const capacityVehHr = satFlow * (gSec / C);
      // Volume-to-Capacity (v/c) ratio
      const vcRatio = capacityVehHr > 0 ? qVehHr / capacityVehHr : 99;

      let currentQueue = 0;
      let maxQueueInSim = 0;
      let totalVehiclesServed = 0;
      let totalDelayVehSec = 0;
      let totalArrivals = 0;
      let sumCycleQueues = 0;

      for (let c = 1; c <= numCycles; c++) {
        // Red Phase Accumulation
        const redArrivals = lambda * rSec;
        const queuePeak = currentQueue + redArrivals;
        if (queuePeak > maxQueueInSim) {
          maxQueueInSim = queuePeak;
        }

        // Red phase delay (area under queue curve during red)
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
          const timeToClear = queuePeak / (mu - lambda);
          const validClearTime = Math.min(gSec, timeToClear);
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
        sumCycleQueues += (queuePeak + queueEnd) / 2;

        currentQueue = queueEnd;
      }

      // Time-integrated average queue length: Total Delay / Total Simulation Time (N * C)
      const avgQueue = (totalDelayVehSec / (numCycles * C));
      // Average delay per vehicle (seconds / vehicle)
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
    keys.forEach(k => { sumAvgQueue += approachResults[k].avgQueueLength; });
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

  /**
   * Compare Current Signal Plan vs Candidate Signal Plan
   */
  function comparePlans(approaches, currentGreens, candidateGreens, config) {
    const currentSim = simulatePlan(approaches, currentGreens, config);
    const candidateSim = simulatePlan(approaches, candidateGreens, config);

    // Acceptance Rule check: Candidate delay < Current delay
    const isImproved = candidateSim.overallAvgWaitTime < currentSim.overallAvgWaitTime;

    const calcPct = (candVal, currVal) => {
      if (currVal === 0) return 0;
      return Math.round(((candVal - currVal) / currVal) * 1000) / 10;
    };

    return {
      current: currentSim,
      candidate: candidateSim,
      isImproved: isImproved,
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

  return {
    simulatePlan,
    comparePlans
  };
})();
