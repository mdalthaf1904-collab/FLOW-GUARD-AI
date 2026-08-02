/**
 * FlowGuard AI - Intersection Congestion Analysis & Signal Optimization Engine
 * Data-Driven 1, 2, & 3-Lane IN/OUT LHT Carriageway SVG Generator & Validation Engine
 */

const AnalysisEngine = (function () {
  'use strict';

  function analyzeApproaches(approaches, intersectionConfig, configType = '4CROSS', inputMode = 'TURNING_MOVEMENTS') {
    const C = parseFloat(intersectionConfig.cycleLength) || 120;
    const satPerLane = parseFloat(intersectionConfig.saturationFlow) || 1800; // PCU/hr/lane
    const activeKeys = FlowGuard.getActiveApproachKeys(configType);

    const processedApproaches = {};
    let totalDemand = 0;

    activeKeys.forEach(k => {
      const app = approaches[k] || { id: k, name: k, flow: 0, currentGreen: 30, left: 0, through: 0, right: 0, lanes: 2 };
      const g = parseFloat(app.currentGreen) || 1;
      const numLanes = parseInt(app.lanes, 10) || 2;
      const totalSatFlow = numLanes * satPerLane;

      const isLeftValid = FlowGuard.isMovementValid(k, 'left', configType);
      const isThroughValid = FlowGuard.isMovementValid(k, 'through', configType);
      const isRightValid = FlowGuard.isMovementValid(k, 'right', configType);

      let qLeft = isLeftValid ? (parseFloat(app.left) || 0) : 0;
      let qThrough = isThroughValid ? (parseFloat(app.through) || 0) : 0;
      let qRight = isRightValid ? (parseFloat(app.right) || 0) : 0;

      let qTotal = 0;
      if (inputMode === 'TURNING_MOVEMENTS') {
        qTotal = qLeft + qThrough + qRight;
      } else if (inputMode === 'AI_DETECTION') {
        qTotal = parseFloat(app.flow) || (qLeft + qThrough + qRight);
      } else {
        qTotal = parseFloat(app.flow) || 0;
        const validCount = (isLeftValid ? 1 : 0) + (isThroughValid ? 1 : 0) + (isRightValid ? 1 : 0);
        if (validCount > 0) {
          if (isThroughValid && isLeftValid && isRightValid) {
            qThrough = Math.round(qTotal * 0.70);
            qLeft = Math.round(qTotal * 0.15);
            qRight = Math.round(qTotal * 0.15);
          } else if (isThroughValid && isLeftValid) {
            qThrough = Math.round(qTotal * 0.80);
            qLeft = Math.round(qTotal * 0.20);
          } else if (isThroughValid && isRightValid) {
            qThrough = Math.round(qTotal * 0.80);
            qRight = Math.round(qTotal * 0.20);
          } else if (isLeftValid && isRightValid) {
            qLeft = Math.round(qTotal * 0.50);
            qRight = Math.round(qTotal * 0.50);
          }
        }
      }

      totalDemand += qTotal;

      const leftPct = qTotal > 0 ? (qLeft / qTotal) * 100 : 0;
      const throughPct = qTotal > 0 ? (qThrough / qTotal) * 100 : 0;
      const rightPct = qTotal > 0 ? (qRight / qTotal) * 100 : 0;

      const capacity = totalSatFlow * (g / C);
      const vcRatio = capacity > 0 ? qTotal / capacity : 99;

      let category = 'LOW';
      let badgeClass = 'badge-low';
      let isOversaturated = false;

      if (vcRatio > 1.0) {
        category = 'OVERSATURATED';
        badgeClass = 'badge-high';
        isOversaturated = true;
      } else if (vcRatio > 0.85) {
        category = 'HIGH';
        badgeClass = 'badge-high';
      } else if (vcRatio >= 0.65) {
        category = 'MEDIUM';
        badgeClass = 'badge-medium';
      }

      processedApproaches[k] = {
        id: app.id || k,
        name: app.name || k,
        flow: qTotal,
        left: qLeft,
        through: qThrough,
        right: qRight,
        lanes: numLanes,
        isLeftValid: isLeftValid,
        isThroughValid: isThroughValid,
        isRightValid: isRightValid,
        leftPct: Math.round(leftPct * 10) / 10,
        throughPct: Math.round(throughPct * 10) / 10,
        rightPct: Math.round(rightPct * 10) / 10,
        currentGreen: g,
        capacity: Math.round(capacity),
        saturationFlow: totalSatFlow,
        vcRatio: Math.round(vcRatio * 100) / 100,
        category: category,
        badgeClass: badgeClass,
        isOversaturated: isOversaturated
      };
    });

    activeKeys.forEach(k => {
      const app = processedApproaches[k];
      app.demandShare = totalDemand > 0 ? Math.round((app.flow / totalDemand) * 1000) / 10 : 0;
    });

    return {
      configType: configType,
      configLabel: FlowGuard.getConfigLabel(configType),
      inputMode: inputMode,
      activeKeys: activeKeys,
      totalDemand: totalDemand,
      cycleLength: C,
      saturationFlow: satPerLane,
      approaches: processedApproaches
    };
  }

  function optimizeSignalTimings(approaches, intersectionConfig, configType = '4CROSS', inputMode = 'TURNING_MOVEMENTS') {
    const analysisData = analyzeApproaches(approaches, intersectionConfig, configType, inputMode);
    const activeApproaches = analysisData.approaches;

    const C = parseFloat(intersectionConfig.cycleLength) || 120;
    const Y = parseFloat(intersectionConfig.yellowTime) || 3;
    const AR = parseFloat(intersectionConfig.allRedTime) || 2;
    const gMin = Math.max(3, parseFloat(intersectionConfig.minGreen) || 7);
    const gMax = Math.min(C - 10, parseFloat(intersectionConfig.maxGreen) || 90);
    const numCycles = parseInt(intersectionConfig.numCycles, 10) || 10;
    const activeKeys = analysisData.activeKeys;

    const nActive = activeKeys.length;
    const lostTimePerPhase = Y + AR;
    const totalLostTime = nActive * lostTimePerPhase;
    const totalEffectiveGreen = Math.max(10, C - totalLostTime);

    const rawCurrentGreens = {};
    activeKeys.forEach(k => {
      rawCurrentGreens[k] = parseFloat(activeApproaches[k] ? activeApproaches[k].currentGreen : 30) || 30;
    });

    const simConfig = {
      cycleLength: C,
      yellowTime: Y,
      allRedTime: AR,
      numCycles: numCycles,
      saturationFlow: intersectionConfig.saturationFlow || 1800,
      activeKeys: activeKeys
    };

    const currentSimResult = SimulationEngine.simulatePlan(activeApproaches, rawCurrentGreens, simConfig);
    const currentOverallWait = currentSimResult.overallAvgWaitTime;

    let bestScore = Infinity;
    let bestGreens = { ...rawCurrentGreens };
    let bestSimResult = null;
    let foundBetter = false;

    if (nActive === 4) {
      const [k0, k1, k2, k3] = activeKeys;
      for (let g0 = gMin; g0 <= gMax; g0++) {
        for (let g1 = gMin; g1 <= gMax; g1++) {
          for (let g2 = gMin; g2 <= gMax; g2++) {
            const g3 = totalEffectiveGreen - (g0 + g1 + g2);
            if (g3 >= gMin && g3 <= gMax) {
              const candGreens = { [k0]: g0, [k1]: g1, [k2]: g2, [k3]: g3 };
              const candSim = SimulationEngine.simulatePlan(activeApproaches, candGreens, simConfig);
              const score = candSim.overallAvgWaitTime + 0.15 * candSim.maxApproachWaitTime;
              if (score < bestScore) {
                bestScore = score;
                bestGreens = candGreens;
                bestSimResult = candSim;
              }
            }
          }
        }
      }
    } else if (nActive === 3) {
      const [k0, k1, k2] = activeKeys;
      for (let g0 = gMin; g0 <= gMax; g0++) {
        for (let g1 = gMin; g1 <= gMax; g1++) {
          const g2 = totalEffectiveGreen - (g0 + g1);
          if (g2 >= gMin && g2 <= gMax) {
            const candGreens = { [k0]: g0, [k1]: g1, [k2]: g2 };
            const candSim = SimulationEngine.simulatePlan(activeApproaches, candGreens, simConfig);
            const score = candSim.overallAvgWaitTime + 0.15 * candSim.maxApproachWaitTime;
            if (score < bestScore) {
              bestScore = score;
              bestGreens = candGreens;
              bestSimResult = candSim;
            }
          }
        }
      }
    }

    if (bestSimResult && bestSimResult.overallAvgWaitTime < currentOverallWait) {
      foundBetter = true;
    }

    const acceptanceStatus = foundBetter ? 'RECOMMENDED' : 'NO_IMPROVEMENT';

    if (!foundBetter) {
      let rawSum = 0;
      activeKeys.forEach(k => { rawSum += rawCurrentGreens[k]; });
      let tempSum = 0;
      activeKeys.forEach(k => {
        const scaledG = Math.max(gMin, Math.round((rawCurrentGreens[k] / (rawSum || 1)) * totalEffectiveGreen));
        bestGreens[k] = scaledG;
        tempSum += scaledG;
      });
      const rem = totalEffectiveGreen - tempSum;
      if (rem !== 0 && activeKeys.length > 0) {
        bestGreens[activeKeys[0]] += rem;
      }
      bestSimResult = SimulationEngine.simulatePlan(activeApproaches, bestGreens, simConfig);
    }

    const recommendation = {};
    activeKeys.forEach(k => {
      const currG = rawCurrentGreens[k];
      const candG = bestGreens[k];
      recommendation[k] = {
        id: activeApproaches[k] ? activeApproaches[k].id : k,
        name: activeApproaches[k] ? activeApproaches[k].name : k,
        currentGreen: currG,
        proposedGreen: candG,
        difference: candG - currG,
        currentWait: currentSimResult.approaches[k] ? currentSimResult.approaches[k].avgWaitTime : 0,
        proposedWait: bestSimResult.approaches[k] ? bestSimResult.approaches[k].avgWaitTime : 0,
        isOversaturated: bestSimResult.approaches[k] ? bestSimResult.approaches[k].isOversaturated : false
      };
    });

    const explanation = generateExplanation(activeApproaches, recommendation, acceptanceStatus, currentSimResult, bestSimResult, activeKeys);

    return {
      configType: configType,
      activeKeys: activeKeys,
      totalEffectiveGreen: totalEffectiveGreen,
      totalLostTime: totalLostTime,
      acceptanceStatus: acceptanceStatus,
      isRecommended: acceptanceStatus === 'RECOMMENDED',
      currentOverallWait: currentSimResult.overallAvgWaitTime,
      proposedOverallWait: bestSimResult.overallAvgWaitTime,
      waitImprovementPct: currentSimResult.overallAvgWaitTime > 0 ? Math.round(((bestSimResult.overallAvgWaitTime - currentSimResult.overallAvgWaitTime) / currentSimResult.overallAvgWaitTime) * 1000) / 10 : 0,
      recommendation: recommendation,
      currentSimResult: currentSimResult,
      proposedSimResult: bestSimResult,
      explanation: explanation
    };
  }

  function generateExplanation(approaches, recMap, status, currentSim, bestSim, activeKeys) {
    if (status !== 'RECOMMENDED') {
      return "NO IMPROVING PLAN FOUND UNDER CURRENT ASSUMPTIONS. Demand across active approaches exceeds effective capacity. Reallocating green time does not yield lower overall vehicle delay. Retaining the baseline signal timing is recommended.";
    }

    let highestDemandApp = activeKeys[0];
    let maxFlow = -1;
    activeKeys.forEach(k => {
      const f = approaches[k] ? approaches[k].flow : 0;
      if (f > maxFlow) {
        maxFlow = f;
        highestDemandApp = approaches[k] ? approaches[k].name : k;
      }
    });

    const waitDiff = Math.abs(Math.round((bestSim.overallAvgWaitTime - currentSim.overallAvgWaitTime) * 10) / 10);

    return `${highestDemandApp} receives additional green duration because its total demand-to-capacity ratio is highest among active approaches. Other active approaches maintain sufficient minimum green time to prevent excessive queue growth. The selected timing plan minimizes total simulated vehicle delay (reducing average delay by ${waitDiff}s/veh) while preserving effective cycle green time across active signal phases.`;
  }

  const LANE_WIDTH = 34;
  const MEDIAN_WIDTH = 10;

  function getInboundLaneCenters(approach, laneCount) {
    const centers = [];
    const count = Math.max(1, Math.min(3, parseInt(laneCount, 10) || 2));
    const totalW = count * LANE_WIDTH;

    if (approach === 'north') {
      const startX = 450 + MEDIAN_WIDTH / 2;
      for (let i = 0; i < count; i++) {
        centers.push(startX + (i + 0.5) * LANE_WIDTH);
      }
    } else if (approach === 'east') {
      const startY = 450 - MEDIAN_WIDTH / 2 - totalW;
      for (let i = 0; i < count; i++) {
        centers.push(startY + (i + 0.5) * LANE_WIDTH);
      }
    } else if (approach === 'south') {
      const startX = 450 - MEDIAN_WIDTH / 2 - totalW;
      for (let i = 0; i < count; i++) {
        centers.push(startX + (i + 0.5) * LANE_WIDTH);
      }
    } else if (approach === 'west') {
      const startY = 450 + MEDIAN_WIDTH / 2;
      for (let i = 0; i < count; i++) {
        centers.push(startY + (i + 0.5) * LANE_WIDTH);
      }
    }
    return centers;
  }

  function getOutboundLaneCenters(approach, laneCount) {
    const centers = [];
    const count = Math.max(1, Math.min(3, parseInt(laneCount, 10) || 2));
    const totalW = count * LANE_WIDTH;

    if (approach === 'north') {
      const startX = 450 - MEDIAN_WIDTH / 2 - totalW;
      for (let i = 0; i < count; i++) {
        centers.push(startX + (i + 0.5) * LANE_WIDTH);
      }
    } else if (approach === 'east') {
      const startY = 450 + MEDIAN_WIDTH / 2;
      for (let i = 0; i < count; i++) {
        centers.push(startY + (i + 0.5) * LANE_WIDTH);
      }
    } else if (approach === 'south') {
      const startX = 450 + MEDIAN_WIDTH / 2;
      for (let i = 0; i < count; i++) {
        centers.push(startX + (i + 0.5) * LANE_WIDTH);
      }
    } else if (approach === 'west') {
      const startY = 450 - MEDIAN_WIDTH / 2 - totalW;
      for (let i = 0; i < count; i++) {
        centers.push(startY + (i + 0.5) * LANE_WIDTH);
      }
    }
    return centers;
  }

  function createThroughPath(origin, destination, approaches) {
    const nInLanes = parseInt(approaches.north?.lanes, 10) || 2;
    const eInLanes = parseInt(approaches.east?.lanes, 10) || 2;
    const sInLanes = parseInt(approaches.south?.lanes, 10) || 2;
    const wInLanes = parseInt(approaches.west?.lanes, 10) || 2;

    if (origin === 'north') {
      const inX = getInboundLaneCenters('north', nInLanes)[Math.floor(nInLanes / 2)];
      const outX = getOutboundLaneCenters('south', sInLanes)[0];
      return { pathD: `M ${inX} 290 L ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: (inX + outX) / 2, symY: 450, symChar: '↓' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[Math.floor(eInLanes / 2)];
      const outY = getOutboundLaneCenters('west', wInLanes)[0];
      return { pathD: `M 610 ${inY} L 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 450, symY: (inY + outY) / 2, symChar: '←' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[Math.floor(sInLanes / 2)];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M ${inX} 610 L ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: (inX + outX) / 2, symY: 450, symChar: '↑' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[Math.floor(wInLanes / 2)];
      const outY = getOutboundLaneCenters('east', eInLanes)[0];
      return { pathD: `M 290 ${inY} L 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 450, symY: (inY + outY) / 2, symChar: '→' };
    }
    return { pathD: '', endX: 0, endY: 0, dir: 'south', symX: 0, symY: 0, symChar: '' };
  }

  function createLeftTurnPath(origin, destination, approaches) {
    const nInLanes = parseInt(approaches.north?.lanes, 10) || 2;
    const eInLanes = parseInt(approaches.east?.lanes, 10) || 2;
    const sInLanes = parseInt(approaches.south?.lanes, 10) || 2;
    const wInLanes = parseInt(approaches.west?.lanes, 10) || 2;

    if (origin === 'north') {
      const inX = getInboundLaneCenters('north', nInLanes)[0];
      const outY = getOutboundLaneCenters('east', eInLanes)[0];
      return { pathD: `M ${inX} 290 C ${inX} 390, 510 ${outY}, 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 520, symY: 380, symChar: '↰' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[0];
      const outX = getOutboundLaneCenters('south', sInLanes)[0];
      return { pathD: `M 610 ${inY} C 510 ${inY}, ${outX} 510, ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: 520, symY: 520, symChar: '↰' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[0];
      const outY = getOutboundLaneCenters('west', wInLanes)[0];
      return { pathD: `M ${inX} 610 C ${inX} 510, 390 ${outY}, 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 380, symY: 520, symChar: '↰' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[0];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M 290 ${inY} C 390 ${inY}, ${outX} 390, ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: 380, symY: 380, symChar: '↰' };
    }
    return { pathD: '', endX: 0, endY: 0, dir: 'south', symX: 0, symY: 0, symChar: '' };
  }

  function createRightTurnPath(origin, destination, approaches) {
    const nInLanes = parseInt(approaches.north?.lanes, 10) || 2;
    const eInLanes = parseInt(approaches.east?.lanes, 10) || 2;
    const sInLanes = parseInt(approaches.south?.lanes, 10) || 2;
    const wInLanes = parseInt(approaches.west?.lanes, 10) || 2;

    if (origin === 'north') {
      const inX = getInboundLaneCenters('north', nInLanes)[nInLanes - 1];
      const outY = getOutboundLaneCenters('west', wInLanes)[0];
      return { pathD: `M ${inX} 290 C ${inX} 360, 360 ${outY}, 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 360, symY: 360, symChar: '↱' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[eInLanes - 1];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M 610 ${inY} C 540 ${inY}, ${outX} 360, ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: 540, symY: 360, symChar: '↱' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[sInLanes - 1];
      const outY = getOutboundLaneCenters('east', eInLanes)[0];
      return { pathD: `M ${inX} 610 C ${inX} 540, 540 ${outY}, 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 540, symY: 540, symChar: '↱' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[wInLanes - 1];
      const outX = getOutboundLaneCenters('south', sInLanes)[0];
      return { pathD: `M 290 ${inY} C 360 ${inY}, ${outX} 540, ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: 360, symY: 540, symChar: '↱' };
    }
    return { pathD: '', endX: 0, endY: 0, dir: 'south', symX: 0, symY: 0, symChar: '' };
  }

  function generateMovementMappingData(approaches, configType = '4CROSS') {
    const origins = ['north', 'east', 'south', 'west'];
    const mTypes = ['left', 'through', 'right'];
    const mappings = [];

    origins.forEach(orig => {
      const app = approaches[orig] || {};

      mTypes.forEach(m => {
        const dest = FlowGuard.getMovementDestination(orig, m);
        const isValid = FlowGuard.isMovementValid(orig, m, configType);
        const vol = isValid ? (app[m] || 0) : 0;

        let pathObj;
        if (m === 'through') pathObj = createThroughPath(orig, dest, approaches);
        else if (m === 'left') pathObj = createLeftTurnPath(orig, dest, approaches);
        else pathObj = createRightTurnPath(orig, dest, approaches);

        mappings.push({
          originKey: orig,
          movementType: m,
          destKey: dest,
          isValid: isValid,
          volume: vol,
          pathD: pathObj.pathD,
          endX: pathObj.endX,
          endY: pathObj.endY,
          dir: pathObj.dir,
          symX: pathObj.symX,
          symY: pathObj.symY,
          symChar: pathObj.symChar
        });
      });
    });

    return mappings;
  }

  function createThroughPath(origin, destination, approaches) {
    const nInLanes = parseInt(approaches.north?.lanes, 10) || 2;
    const eInLanes = parseInt(approaches.east?.lanes, 10) || 2;
    const sInLanes = parseInt(approaches.south?.lanes, 10) || 2;
    const wInLanes = parseInt(approaches.west?.lanes, 10) || 2;

    if (origin === 'north') {
      const inX = getInboundLaneCenters('north', nInLanes)[Math.floor(nInLanes / 2)];
      const outX = getOutboundLaneCenters('south', sInLanes)[0];
      return { pathD: `M ${inX} 290 L ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: (inX + outX) / 2, symY: 450, symChar: '↓' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[Math.floor(eInLanes / 2)];
      const outY = getOutboundLaneCenters('west', wInLanes)[0];
      return { pathD: `M 610 ${inY} L 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 450, symY: (inY + outY) / 2, symChar: '←' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[Math.floor(sInLanes / 2)];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M ${inX} 610 L ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: (inX + outX) / 2, symY: 450, symChar: '↑' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[Math.floor(wInLanes / 2)];
      const outY = getOutboundLaneCenters('east', eInLanes)[0];
      return { pathD: `M 290 ${inY} L 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 450, symY: (inY + outY) / 2, symChar: '→' };
    }
    return { pathD: '', endX: 0, endY: 0, dir: 'south', symX: 0, symY: 0, symChar: '' };
  }

  function createLeftTurnPath(origin, destination, approaches) {
    const nInLanes = parseInt(approaches.north?.lanes, 10) || 2;
    const eInLanes = parseInt(approaches.east?.lanes, 10) || 2;
    const sInLanes = parseInt(approaches.south?.lanes, 10) || 2;
    const wInLanes = parseInt(approaches.west?.lanes, 10) || 2;

    if (origin === 'north') {
      const inX = getInboundLaneCenters('north', nInLanes)[0];
      const outY = getOutboundLaneCenters('east', eInLanes)[0];
      return { pathD: `M ${inX} 290 C ${inX} 390, 510 ${outY}, 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 520, symY: 380, symChar: '↰' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[0];
      const outX = getOutboundLaneCenters('south', sInLanes)[0];
      return { pathD: `M 610 ${inY} C 510 ${inY}, ${outX} 510, ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: 520, symY: 520, symChar: '↰' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[0];
      const outY = getOutboundLaneCenters('west', wInLanes)[0];
      return { pathD: `M ${inX} 610 C ${inX} 510, 390 ${outY}, 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 380, symY: 520, symChar: '↰' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[0];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M 290 ${inY} C 390 ${inY}, ${outX} 390, ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: 380, symY: 380, symChar: '↰' };
    }
    return { pathD: '', endX: 0, endY: 0, dir: 'south', symX: 0, symY: 0, symChar: '' };
  }

  function createRightTurnPath(origin, destination, approaches) {
    const nInLanes = parseInt(approaches.north?.lanes, 10) || 2;
    const eInLanes = parseInt(approaches.east?.lanes, 10) || 2;
    const sInLanes = parseInt(approaches.south?.lanes, 10) || 2;
    const wInLanes = parseInt(approaches.west?.lanes, 10) || 2;

    if (origin === 'north') {
      const inX = getInboundLaneCenters('north', nInLanes)[nInLanes - 1];
      const outY = getOutboundLaneCenters('west', wInLanes)[0];
      return { pathD: `M ${inX} 290 C ${inX} 360, 360 ${outY}, 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 360, symY: 360, symChar: '↱' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[eInLanes - 1];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M 610 ${inY} C 540 ${inY}, ${outX} 360, ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: 540, symY: 360, symChar: '↱' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[sInLanes - 1];
      const outY = getOutboundLaneCenters('east', eInLanes)[0];
      return { pathD: `M ${inX} 610 C ${inX} 540, 540 ${outY}, 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 540, symY: 540, symChar: '↱' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[wInLanes - 1];
      const outX = getOutboundLaneCenters('south', sInLanes)[0];
      return { pathD: `M 290 ${inY} C 360 ${inY}, ${outX} 540, ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: 360, symY: 540, symChar: '↱' };
    }
    return { pathD: '', endX: 0, endY: 0, dir: 'south', symX: 0, symY: 0, symChar: '' };
  }

  function generateMovementMappingData(approaches, configType = '4CROSS') {
    const origins = ['north', 'east', 'south', 'west'];
    const mTypes = ['left', 'through', 'right'];
    const mappings = [];

    origins.forEach(orig => {
      const app = approaches[orig] || {};

      mTypes.forEach(m => {
        const dest = FlowGuard.getMovementDestination(orig, m);
        const isValid = FlowGuard.isMovementValid(orig, m, configType);
        const vol = isValid ? (app[m] || 0) : 0;

        let pathObj;
        if (m === 'through') pathObj = createThroughPath(orig, dest, approaches);
        else if (m === 'left') pathObj = createLeftTurnPath(orig, dest, approaches);
        else pathObj = createRightTurnPath(orig, dest, approaches);

        mappings.push({
          originKey: orig,
          movementType: m,
          destKey: dest,
          isValid: isValid,
          volume: vol,
          pathD: pathObj.pathD,
          endX: pathObj.endX,
          endY: pathObj.endY,
          dir: pathObj.dir,
          symX: pathObj.symX,
          symY: pathObj.symY,
          symChar: pathObj.symChar
        });
      });
    });

    return mappings;
  }

  // Centralized Direction Configuration (Single Source of Truth for IN/OUT geometry)
  const DIRECTION_CONFIG = {
    north: {
      key: 'north',
      id: 'A',
      roadName: 'ROAD A — NORTH',
      inboundVector: { dx: 0, dy: 1, arrow: '↓', label: 'IN' },   // SOUTHBOUND (toward intersection)
      outboundVector: { dx: 0, dy: -1, arrow: '↑', label: 'OUT' }, // NORTHBOUND (away from intersection)
      inboundSide: 'right',
      outboundSide: 'left',
      inColor: '#38bdf8',
      outColor: '#22c55e'
    },
    east: {
      key: 'east',
      id: 'B',
      roadName: 'ROAD B — EAST',
      inboundVector: { dx: -1, dy: 0, arrow: '←', label: 'IN' },  // WESTBOUND (toward intersection)
      outboundVector: { dx: 1, dy: 0, arrow: '→', label: 'OUT' },  // EASTBOUND (away from intersection)
      inboundSide: 'bottom',
      outboundSide: 'top',
      inColor: '#38bdf8',
      outColor: '#22c55e'
    },
    south: {
      key: 'south',
      id: 'C',
      roadName: 'ROAD C — SOUTH',
      inboundVector: { dx: 0, dy: -1, arrow: '↑', label: 'IN' },  // NORTHBOUND (toward intersection)
      outboundVector: { dx: 0, dy: 1, arrow: '↓', label: 'OUT' },  // SOUTHBOUND (away from intersection)
      inboundSide: 'left',
      outboundSide: 'right',
      inColor: '#38bdf8',
      outColor: '#22c55e'
    },
    west: {
      key: 'west',
      id: 'D',
      roadName: 'ROAD D — WEST',
      inboundVector: { dx: 1, dy: 0, arrow: '→', label: 'IN' },   // EASTBOUND (toward intersection)
      outboundVector: { dx: -1, dy: 0, arrow: '←', label: 'OUT' },  // WESTBOUND (away from intersection)
      inboundSide: 'top',
      outboundSide: 'bottom',
      inColor: '#38bdf8',
      outColor: '#22c55e'
    }
  };

  function validateDirections(configType = '4CROSS') {
    const center = { x: 400, y: 400 };
    const dist = (p) => Math.hypot(p.x - center.x, p.y - center.y);
    const assertions = [];
    const errors = [];
    const activeKeys = FlowGuard.getActiveApproachKeys ? FlowGuard.getActiveApproachKeys(configType) : ['north', 'east', 'south', 'west'];

    const coords = {
      north: {
        in: { start: { x: 440, y: 100 }, end: { x: 440, y: 260 }, expected: '↓', check: (dx, dy) => dy > 0 },
        out: { start: { x: 360, y: 260 }, end: { x: 360, y: 100 }, expected: '↑', check: (dx, dy) => dy < 0 }
      },
      east: {
        in: { start: { x: 700, y: 440 }, end: { x: 540, y: 440 }, expected: '←', check: (dx, dy) => dx < 0 },
        out: { start: { x: 540, y: 360 }, end: { x: 700, y: 360 }, expected: '→', check: (dx, dy) => dx > 0 }
      },
      south: {
        in: { start: { x: 360, y: 700 }, end: { x: 360, y: 540 }, expected: '↑', check: (dx, dy) => dy < 0 },
        out: { start: { x: 440, y: 540 }, end: { x: 440, y: 700 }, expected: '↓', check: (dx, dy) => dy > 0 }
      },
      west: {
        in: { start: { x: 100, y: 360 }, end: { x: 260, y: 360 }, expected: '→', check: (dx, dy) => dx > 0 },
        out: { start: { x: 260, y: 440 }, end: { x: 200, y: 440 }, expected: '←', check: (dx, dy) => dx < 0 }
      }
    };

    activeKeys.forEach(roadKey => {
      const cfg = DIRECTION_CONFIG[roadKey];
      ['in', 'out'].forEach(type => {
        const item = coords[roadKey][type];
        const dx = item.end.x - item.start.x;
        const dy = item.end.y - item.start.y;
        const vecOk = item.check(dx, dy);
        const dStart = dist(item.start);
        const dEnd = dist(item.end);
        const distOk = (type === 'in') ? (dEnd < dStart) : (dEnd > dStart);

        const pass = vecOk && distOk;
        assertions.push({
          road: cfg.roadName,
          type: type.toUpperCase(),
          expectedArrow: item.expected,
          vecOk,
          distOk,
          pass
        });

        if (!pass) {
          errors.push(`FAILED assertion for ${cfg.roadName} ${type.toUpperCase()}: vecOk=${vecOk}, distOk=${distOk}`);
        }
      });
    });

    return {
      configType,
      activeKeys,
      valid: errors.length === 0,
      assertions,
      errors
    };
  }

  function renderIntersectionSVG(containerId, analysisData, selectedOrigin = 'north', selectedMovement = 'ALL') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const configType = analysisData.configType || '4CROSS';
    const activeKeys = FlowGuard.getActiveApproachKeys(configType);
    const apps = analysisData.approaches || {};

    const hasNorth = activeKeys.includes('north');
    const hasEast = activeKeys.includes('east');
    const hasSouth = activeKeys.includes('south');
    const hasWest = activeKeys.includes('west');

    // Programmatic direction validation for active approaches
    const valRes = validateDirections(configType);

    let pavementHTML = '';
    let boundaryLinesHTML = '';
    let yellowCenterLinesHTML = '';
    let stopLinesHTML = '';
    let directionArrowsHTML = '';
    let roadBadgesHTML = '';
    let approachInfoCardsHTML = '';
    let signalsHTML = '';

    // Central Junction Core
    pavementHTML += `<rect x="320" y="320" width="160" height="160" fill="#1b2434" />`;

    // 1. NORTH ARM (Road A)
    if (hasNorth) {
      const app = apps.north || {};
      const flowVal = FlowGuard.formatNum ? FlowGuard.formatNum(app.flow || 0) : (app.flow || 0);
      const vcVal = app.vcRatio !== undefined ? app.vcRatio : '-';

      pavementHTML += `<rect x="320" y="40" width="160" height="280" fill="#1b2434" />`;
      yellowCenterLinesHTML += `<line x1="400" y1="40" x2="400" y2="320" stroke="#f59e0b" stroke-width="5" />`;
      stopLinesHTML += `<line x1="400" y1="320" x2="480" y2="320" stroke="#ffffff" stroke-width="7" />`;

      // OUT Lane (Left: x=360, UP ↑) - Green arrows
      directionArrowsHTML += `
        <g>
          <line x1="360" y1="270" x2="360" y2="190" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-up)" />
          <line x1="360" y1="170" x2="360" y2="90" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-up)" />
          <text x="360" y="75" fill="#22c55e" font-size="16" font-weight="800" text-anchor="middle">OUT</text>
        </g>
      `;

      // IN Lane (Right: x=440, DOWN ↓) - Blue arrows
      directionArrowsHTML += `
        <g>
          <line x1="440" y1="90" x2="440" y2="170" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-down)" />
          <line x1="440" y1="190" x2="440" y2="270" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-down)" />
          <text x="440" y="75" fill="#38bdf8" font-size="16" font-weight="800" text-anchor="middle">IN</text>
        </g>
      `;

      // Road Title Badge
      roadBadgesHTML += `
        <g transform="translate(310, 10)">
          <rect x="0" y="0" width="180" height="32" rx="6" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/>
          <text x="90" y="21" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">ROAD A — NORTH</text>
        </g>
      `;

      // Approach Info Card
      approachInfoCardsHTML += `
        <g transform="translate(490, 40)">
          <rect x="0" y="0" width="140" height="42" rx="6" fill="rgba(15,23,42,0.85)" stroke="#334155" stroke-width="1"/>
          <text x="10" y="18" fill="#38bdf8" font-size="11" font-weight="bold">INBOUND: ${flowVal} PCU/h</text>
          <text x="10" y="34" fill="#cbd5e1" font-size="11">v/c Ratio: ${vcVal}</text>
        </g>
      `;

      // Traffic Signal Light on INBOUND side near stop line
      signalsHTML += `
        <g transform="translate(485, 305)">
          <rect x="0" y="0" width="16" height="34" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5"/>
          <circle cx="8" cy="7" r="3.5" fill="#ef4444"/>
          <circle cx="8" cy="17" r="3.5" fill="#f59e0b"/>
          <circle cx="8" cy="27" r="3.5" fill="#10b981"/>
        </g>
      `;
    }

    // 2. EAST ARM (Road B)
    if (hasEast) {
      const app = apps.east || {};
      const flowVal = FlowGuard.formatNum ? FlowGuard.formatNum(app.flow || 0) : (app.flow || 0);
      const vcVal = app.vcRatio !== undefined ? app.vcRatio : '-';

      pavementHTML += `<rect x="480" y="320" width="280" height="160" fill="#1b2434" />`;
      yellowCenterLinesHTML += `<line x1="480" y1="400" x2="760" y2="400" stroke="#f59e0b" stroke-width="5" />`;
      stopLinesHTML += `<line x1="480" y1="400" x2="480" y2="480" stroke="#ffffff" stroke-width="7" />`;

      // OUT Lane (Top: y=360, RIGHT →) - Green arrows
      directionArrowsHTML += `
        <g>
          <line x1="530" y1="360" x2="610" y2="360" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-right)" />
          <line x1="630" y1="360" x2="710" y2="360" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-right)" />
          <text x="735" y="365" fill="#22c55e" font-size="16" font-weight="800" text-anchor="start">OUT</text>
        </g>
      `;

      // IN Lane (Bottom: y=440, LEFT ←) - Blue arrows
      directionArrowsHTML += `
        <g>
          <line x1="710" y1="440" x2="630" y2="440" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-left)" />
          <line x1="610" y1="440" x2="530" y2="440" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-left)" />
          <text x="735" y="445" fill="#38bdf8" font-size="16" font-weight="800" text-anchor="start">IN</text>
        </g>
      `;

      // Road Title Badge
      roadBadgesHTML += `
        <g transform="translate(610, 275)">
          <rect x="0" y="0" width="160" height="32" rx="6" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/>
          <text x="80" y="21" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">ROAD B — EAST</text>
        </g>
      `;

      // Approach Info Card
      approachInfoCardsHTML += `
        <g transform="translate(610, 490)">
          <rect x="0" y="0" width="140" height="42" rx="6" fill="rgba(15,23,42,0.85)" stroke="#334155" stroke-width="1"/>
          <text x="10" y="18" fill="#38bdf8" font-size="11" font-weight="bold">INBOUND: ${flowVal} PCU/h</text>
          <text x="10" y="34" fill="#cbd5e1" font-size="11">v/c Ratio: ${vcVal}</text>
        </g>
      `;

      // Traffic Signal Light on INBOUND side near stop line
      signalsHTML += `
        <g transform="translate(485, 485)">
          <rect x="0" y="0" width="34" height="16" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5"/>
          <circle cx="7" cy="8" r="3.5" fill="#ef4444"/>
          <circle cx="17" cy="8" r="3.5" fill="#f59e0b"/>
          <circle cx="27" cy="8" r="3.5" fill="#10b981"/>
        </g>
      `;
    }

    // 3. SOUTH ARM (Road C)
    if (hasSouth) {
      const app = apps.south || {};
      const flowVal = FlowGuard.formatNum ? FlowGuard.formatNum(app.flow || 0) : (app.flow || 0);
      const vcVal = app.vcRatio !== undefined ? app.vcRatio : '-';

      pavementHTML += `<rect x="320" y="480" width="160" height="280" fill="#1b2434" />`;
      yellowCenterLinesHTML += `<line x1="400" y1="480" x2="400" y2="760" stroke="#f59e0b" stroke-width="5" />`;
      stopLinesHTML += `<line x1="320" y1="480" x2="400" y2="480" stroke="#ffffff" stroke-width="7" />`;

      // IN Lane (Left: x=360, UP ↑) - Blue arrows
      directionArrowsHTML += `
        <g>
          <line x1="360" y1="710" x2="360" y2="630" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-up)" />
          <line x1="360" y1="610" x2="360" y2="530" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-up)" />
          <text x="360" y="735" fill="#38bdf8" font-size="16" font-weight="800" text-anchor="middle">IN</text>
        </g>
      `;

      // OUT Lane (Right: x=440, DOWN ↓) - Green arrows
      directionArrowsHTML += `
        <g>
          <line x1="440" y1="530" x2="440" y2="610" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-down)" />
          <line x1="440" y1="630" x2="440" y2="710" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-down)" />
          <text x="440" y="735" fill="#22c55e" font-size="16" font-weight="800" text-anchor="middle">OUT</text>
        </g>
      `;

      // Road Title Badge
      roadBadgesHTML += `
        <g transform="translate(310, 760)">
          <rect x="0" y="0" width="180" height="32" rx="6" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/>
          <text x="90" y="21" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">ROAD C — SOUTH</text>
        </g>
      `;

      // Approach Info Card
      approachInfoCardsHTML += `
        <g transform="translate(170, 710)">
          <rect x="0" y="0" width="140" height="42" rx="6" fill="rgba(15,23,42,0.85)" stroke="#334155" stroke-width="1"/>
          <text x="10" y="18" fill="#38bdf8" font-size="11" font-weight="bold">INBOUND: ${flowVal} PCU/h</text>
          <text x="10" y="34" fill="#cbd5e1" font-size="11">v/c Ratio: ${vcVal}</text>
        </g>
      `;

      // Traffic Signal Light on INBOUND side near stop line
      signalsHTML += `
        <g transform="translate(295, 460)">
          <rect x="0" y="0" width="16" height="34" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5"/>
          <circle cx="8" cy="7" r="3.5" fill="#ef4444"/>
          <circle cx="8" cy="17" r="3.5" fill="#f59e0b"/>
          <circle cx="8" cy="27" r="3.5" fill="#10b981"/>
        </g>
      `;
    }

    // 4. WEST ARM (Road D)
    if (hasWest) {
      const app = apps.west || {};
      const flowVal = FlowGuard.formatNum ? FlowGuard.formatNum(app.flow || 0) : (app.flow || 0);
      const vcVal = app.vcRatio !== undefined ? app.vcRatio : '-';

      pavementHTML += `<rect x="40" y="320" width="280" height="160" fill="#1b2434" />`;
      yellowCenterLinesHTML += `<line x1="40" y1="400" x2="320" y2="400" stroke="#f59e0b" stroke-width="5" />`;
      stopLinesHTML += `<line x1="320" y1="320" x2="320" y2="400" stroke="#ffffff" stroke-width="7" />`;

      // IN Lane (Top: y=360, RIGHT →) - Blue arrows
      directionArrowsHTML += `
        <g>
          <line x1="90" y1="360" x2="170" y2="360" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-right)" />
          <line x1="190" y1="360" x2="270" y2="360" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-right)" />
          <text x="65" y="365" fill="#38bdf8" font-size="16" font-weight="800" text-anchor="end">IN</text>
        </g>
      `;

      // OUT Lane (Bottom: y=440, LEFT ←) - Green arrows
      directionArrowsHTML += `
        <g>
          <line x1="270" y1="440" x2="190" y2="440" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-left)" />
          <line x1="170" y1="440" x2="90" y2="440" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-left)" />
          <text x="65" y="445" fill="#22c55e" font-size="16" font-weight="800" text-anchor="end">OUT</text>
        </g>
      `;

      // Road Title Badge
      roadBadgesHTML += `
        <g transform="translate(30, 275)">
          <rect x="0" y="0" width="160" height="32" rx="6" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/>
          <text x="80" y="21" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">ROAD D — WEST</text>
        </g>
      `;

      // Approach Info Card
      approachInfoCardsHTML += `
        <g transform="translate(50, 490)">
          <rect x="0" y="0" width="140" height="42" rx="6" fill="rgba(15,23,42,0.85)" stroke="#334155" stroke-width="1"/>
          <text x="10" y="18" fill="#38bdf8" font-size="11" font-weight="bold">INBOUND: ${flowVal} PCU/h</text>
          <text x="10" y="34" fill="#cbd5e1" font-size="11">v/c Ratio: ${vcVal}</text>
        </g>
      `;

      // Traffic Signal Light on INBOUND side near stop line
      signalsHTML += `
        <g transform="translate(280, 295)">
          <rect x="0" y="0" width="34" height="16" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5"/>
          <circle cx="7" cy="8" r="3.5" fill="#ef4444"/>
          <circle cx="17" cy="8" r="3.5" fill="#f59e0b"/>
          <circle cx="27" cy="8" r="3.5" fill="#10b981"/>
        </g>
      `;
    }

    // 5. ROAD EDGE BOUNDARY LINES & DYNAMIC T-JUNCTION WALLS
    if (hasNorth) {
      boundaryLinesHTML += `<line x1="320" y1="40" x2="480" y2="40" stroke="#f8fafc" stroke-width="4" />`;
      boundaryLinesHTML += `<line x1="320" y1="40" x2="320" y2="${hasWest ? '250' : '760'}" stroke="#f8fafc" stroke-width="4" />`;
      boundaryLinesHTML += `<line x1="480" y1="40" x2="480" y2="${hasEast ? '250' : '760'}" stroke="#f8fafc" stroke-width="4" />`;
    }
    if (hasEast) {
      boundaryLinesHTML += `<line x1="760" y1="320" x2="760" y2="480" stroke="#f8fafc" stroke-width="4" />`;
      boundaryLinesHTML += `<line x1="${hasNorth ? '550' : '480'}" y1="320" x2="760" y2="320" stroke="#f8fafc" stroke-width="4" />`;
      boundaryLinesHTML += `<line x1="${hasSouth ? '550' : '480'}" y1="480" x2="760" y2="480" stroke="#f8fafc" stroke-width="4" />`;
    }
    if (hasSouth) {
      boundaryLinesHTML += `<line x1="320" y1="760" x2="480" y2="760" stroke="#f8fafc" stroke-width="4" />`;
      if (!hasWest) boundaryLinesHTML += `<line x1="320" y1="40" x2="320" y2="760" stroke="#f8fafc" stroke-width="4" />`;
      else boundaryLinesHTML += `<line x1="320" y1="550" x2="320" y2="760" stroke="#f8fafc" stroke-width="4" />`;

      if (!hasEast) boundaryLinesHTML += `<line x1="480" y1="40" x2="480" y2="760" stroke="#f8fafc" stroke-width="4" />`;
      else boundaryLinesHTML += `<line x1="480" y1="550" x2="480" y2="760" stroke="#f8fafc" stroke-width="4" />`;
    }
    if (hasWest) {
      boundaryLinesHTML += `<line x1="40" y1="320" x2="40" y2="480" stroke="#f8fafc" stroke-width="4" />`;
      boundaryLinesHTML += `<line x1="40" y1="320" x2="${hasNorth ? '250' : '320'}" y2="320" stroke="#f8fafc" stroke-width="4" />`;
      boundaryLinesHTML += `<line x1="40" y1="480" x2="${hasSouth ? '250' : '320'}" y2="480" stroke="#f8fafc" stroke-width="4" />`;
    }

    // Corner Curb Arcs for meeting arms
    if (hasNorth && hasWest) {
      boundaryLinesHTML += `<path d="M 320 250 Q 320 320 250 320" stroke="#ffffff" stroke-width="4" fill="none" />`;
    }
    if (hasNorth && hasEast) {
      boundaryLinesHTML += `<path d="M 480 250 Q 480 320 550 320" stroke="#ffffff" stroke-width="4" fill="none" />`;
    }
    if (hasSouth && hasEast) {
      boundaryLinesHTML += `<path d="M 550 480 Q 480 480 480 550" stroke="#ffffff" stroke-width="4" fill="none" />`;
    }
    if (hasSouth && hasWest) {
      boundaryLinesHTML += `<path d="M 250 480 Q 320 480 320 550" stroke="#ffffff" stroke-width="4" fill="none" />`;
    }

    const svgHTML = `
      <svg viewBox="0 0 800 800" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background: #090d16; border-radius: 12px; box-shadow: inset 0 0 30px rgba(0,0,0,0.8);">
        <defs>
          <!-- Arrow Markers -->
          <marker id="arrow-blue-down" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
          </marker>
          <marker id="arrow-blue-up" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
          </marker>
          <marker id="arrow-blue-left" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
          </marker>
          <marker id="arrow-blue-right" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
          </marker>

          <marker id="arrow-green-up" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
          </marker>
          <marker id="arrow-green-down" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
          </marker>
          <marker id="arrow-green-left" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
          </marker>
          <marker id="arrow-green-right" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
          </marker>
        </defs>

        <!-- Dynamic Asphalt Road Geometry -->
        ${pavementHTML}

        <!-- Dynamic Outer Boundaries & T-Junction Walls -->
        ${boundaryLinesHTML}

        <!-- Yellow Centre Lines -->
        ${yellowCenterLinesHTML}

        <!-- Inbound Transverse White Stop Lines -->
        ${stopLinesHTML}

        <!-- Permanent Directional Arrows & Labels (IN=Blue, OUT=Green) -->
        ${directionArrowsHTML}

        <!-- Road Title Badges -->
        ${roadBadgesHTML}

        <!-- Approach Traffic Info Overlay Cards -->
        ${approachInfoCardsHTML}

        <!-- Traffic Signal Lights -->
        ${signalsHTML}

        <!-- LEGEND BOX (Bottom-Left) -->
        <g transform="translate(25, 660)">
          <rect x="0" y="0" width="260" height="125" rx="8" fill="rgba(15,23,42,0.92)" stroke="#334155" stroke-width="1.5" />
          <text x="16" y="24" fill="#ffffff" font-size="13" font-weight="800">LEGEND</text>
          
          <!-- Blue Arrow - IN -->
          <line x1="16" y1="44" x2="48" y2="44" stroke="#38bdf8" stroke-width="3.5" marker-end="url(#arrow-blue-right)" />
          <text x="58" y="48" fill="#38bdf8" font-size="12" font-weight="bold">IN (Towards Intersection)</text>

          <!-- Green Arrow - OUT -->
          <line x1="16" y1="68" x2="48" y2="68" stroke="#22c55e" stroke-width="3.5" marker-end="url(#arrow-green-right)" />
          <text x="58" y="72" fill="#22c55e" font-size="12" font-weight="bold">OUT (Away from Intersection)</text>

          <!-- Yellow Line - Centre Line -->
          <line x1="16" y1="92" x2="48" y2="92" stroke="#f59e0b" stroke-width="4" />
          <text x="58" y="96" fill="#f59e0b" font-size="12" font-weight="bold">Centre Line</text>

          <!-- White Line - Stop Line -->
          <line x1="16" y1="112" x2="48" y2="112" stroke="#ffffff" stroke-width="5" />
          <text x="58" y="116" fill="#ffffff" font-size="12" font-weight="bold">Stop Line (IN only)</text>
        </g>

        <!-- NOTES BOX (Bottom-Right) -->
        <g transform="translate(515, 660)">
          <rect x="0" y="0" width="260" height="125" rx="8" fill="rgba(15,23,42,0.92)" stroke="#334155" stroke-width="1.5" />
          <text x="16" y="24" fill="#ffffff" font-size="13" font-weight="800">NOTES</text>
          <text x="16" y="48" fill="#cbd5e1" font-size="12">• IN = Towards Intersection</text>
          <text x="16" y="72" fill="#cbd5e1" font-size="12">• OUT = Away from Intersection</text>
          <text x="16" y="96" fill="#cbd5e1" font-size="12">• Green/Blue = Flow Direction</text>
          <text x="16" y="116" fill="#cbd5e1" font-size="12">• Stop line only on IN lanes</text>
        </g>
      </svg>
    `;

    container.innerHTML = svgHTML;
  }

  return {
    DIRECTION_CONFIG,
    validateDirections,
    analyzeApproaches,
    optimizeSignalTimings,
    renderIntersectionSVG,
    generateMovementMappingData
  };
})();
