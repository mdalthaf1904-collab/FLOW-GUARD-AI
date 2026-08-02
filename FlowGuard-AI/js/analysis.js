/**
 * FlowGuard AI - Intersection Congestion Analysis & Signal Optimization Engine
 * Data-Driven 1, 2, & 3-Lane IN/OUT LHT Carriageway SVG Generator & Validation Engine
 */

const AnalysisEngine = (function() {
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

      const isLeftValid    = FlowGuard.isMovementValid(k, 'left', configType);
      const isThroughValid = FlowGuard.isMovementValid(k, 'through', configType);
      const isRightValid   = FlowGuard.isMovementValid(k, 'right', configType);

      let qLeft    = Math.max(0, isLeftValid    ? (parseFloat(app.left) || 0) : 0);
      let qThrough = Math.max(0, isThroughValid ? (parseFloat(app.through) || 0) : 0);
      let qRight   = Math.max(0, isRightValid   ? (parseFloat(app.right) || 0) : 0);

      let qTotal = 0;
      if (inputMode === 'TURNING_MOVEMENTS') {
        qTotal = qLeft + qThrough + qRight;
      } else if (inputMode === 'AI_DETECTION') {
        qTotal = Math.max(0, parseFloat(app.flow) || (qLeft + qThrough + qRight));
      } else {
        qTotal = Math.max(0, parseFloat(app.flow) || 0);
        const validCount = (isLeftValid ? 1 : 0) + (isThroughValid ? 1 : 0) + (isRightValid ? 1 : 0);
        if (validCount > 0) {
          if (isThroughValid && isLeftValid && isRightValid) {
            qThrough = Math.round(qTotal * 0.70);
            qLeft    = Math.round(qTotal * 0.15);
            qRight   = Math.round(qTotal * 0.15);
          } else if (isThroughValid && isLeftValid) {
            qThrough = Math.round(qTotal * 0.80);
            qLeft    = Math.round(qTotal * 0.20);
          } else if (isThroughValid && isRightValid) {
            qThrough = Math.round(qTotal * 0.80);
            qRight   = Math.round(qTotal * 0.20);
          } else if (isLeftValid && isRightValid) {
            qLeft    = Math.round(qTotal * 0.50);
            qRight   = Math.round(qTotal * 0.50);
          }
        }
      }
      qTotal = Math.max(0, qTotal);

      totalDemand += qTotal;

      const leftPct    = qTotal > 0 ? (qLeft / qTotal) * 100 : 0;
      const throughPct = qTotal > 0 ? (qThrough / qTotal) * 100 : 0;
      const rightPct   = qTotal > 0 ? (qRight / qTotal) * 100 : 0;

      const capacity = totalSatFlow * (g / C);
      const vcRatio = capacity > 0 ? qTotal / capacity : 99;

      let category = 'LOW';
      let badgeClass = 'badge-low';
      let isOversaturated = (vcRatio > 1.0);

      if (typeof CongestionEngine !== 'undefined' && CongestionEngine.classifyCongestion) {
        const sev = CongestionEngine.classifyCongestion(vcRatio);
        category = sev.label;
        badgeClass = sev.badgeClass;
      } else {
        if (vcRatio > 1.0) {
          category = 'OVERSATURATED';
          badgeClass = 'badge-oversaturated';
        } else if (vcRatio > 0.90) {
          category = 'SEVERE';
          badgeClass = 'badge-severe';
        } else if (vcRatio > 0.80) {
          category = 'HIGH';
          badgeClass = 'badge-medium';
        } else if (vcRatio > 0.60) {
          category = 'MODERATE';
          badgeClass = 'badge-moderate';
        }
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

  /* =====================================================================
     MILESTONE 6.4 & NEXT MILESTONE: PROTOTYPE OPTIMIZATION PARAMETERS
     Centralized multi-objective weights and Stage 3 refinement constants.
  ===================================================================== */
  const PROTOTYPE_OPTIMIZATION_WEIGHTS = {
    NETWORK_DELAY_WEIGHT: 1.0,        // Weight for overall network average wait time
    MAX_APPROACH_DELAY_WEIGHT: 0.85,   // Weight for worst approach wait time
    DELAY_SPREAD_WEIGHT: 0.40,        // Weight for (maxWait - minWait)
    DETERIORATION_THRESHOLD_SEC: 10.0, // Delay increase threshold before penalty kicks in
    DETERIORATION_PENALTY_MULT: 15.0,  // Multiplier for approach deterioration
    OVERSATURATION_PENALTY: 150.0      // Penalty per oversaturated approach (v/c > 1.0)
  };

  const PROTOTYPE_REFINEMENT_PARAMS = {
    REFINEMENT_STEP_SECONDS: 1,      // Local green transfer step size (sec)
    MAX_REFINEMENT_ITERATIONS: 20,    // Bounded local search iterations
    MAX_EVALUATIONS: 100              // Maximum candidate plans evaluated
  };

  /**
   * Stage 3: Iterative Simulation-Validated Timing Refinement
   * Starts from Stage 2 candidate timing and performs deterministic local search
   * over neighboring green allocations evaluated via SimulationEngine.simulatePlan.
   */
  function refineSignalTimings(balancedGreens, activeApproaches, simConfig, currentSimResult, initialSimResult, analysisData, gMin, gMax, totalEffectiveGreen) {
    const activeKeys = simConfig.activeKeys || Object.keys(activeApproaches);
    let currentBestGreens = { ...balancedGreens };
    let currentBestSim = SimulationEngine.simulatePlan(activeApproaches, currentBestGreens, simConfig);
    let currentBestScore = evaluateBalancedCandidateScore(currentBestSim, currentSimResult, activeKeys, initialSimResult);

    const stage2NetworkDelay = currentBestSim.overallAvgWaitTime || 0;
    const stage2MaxQueue     = currentBestSim.overallMaxQueue || 0;
    const stage2WorstDelay   = currentBestSim.maxApproachWaitTime || 0;

    let evaluationsCount = 1; // Initial Stage 2 plan evaluation
    let iterationsCount  = 0;
    let improvedInStage3 = false;

    while (iterationsCount < PROTOTYPE_REFINEMENT_PARAMS.MAX_REFINEMENT_ITERATIONS && evaluationsCount < PROTOTYPE_REFINEMENT_PARAMS.MAX_EVALUATIONS) {
      let foundNeighborImprovement = false;

      // Test all pairwise green time transfers of REFINEMENT_STEP_SECONDS between active approaches
      for (let i = 0; i < activeKeys.length; i++) {
        for (let j = 0; j < activeKeys.length; j++) {
          if (i === j) continue;
          if (evaluationsCount >= PROTOTYPE_REFINEMENT_PARAMS.MAX_EVALUATIONS) break;

          const donorKey    = activeKeys[i];
          const receiverKey = activeKeys[j];
          const donorG      = currentBestGreens[donorKey] || gMin;
          const receiverG   = currentBestGreens[receiverKey] || gMin;
          const step        = PROTOTYPE_REFINEMENT_PARAMS.REFINEMENT_STEP_SECONDS;

          // Check feasibility bounds
          if (donorG - step < gMin || receiverG + step > gMax) {
            continue;
          }

          const candGreens = { ...currentBestGreens };
          candGreens[donorKey]    = donorG - step;
          candGreens[receiverKey] = receiverG + step;

          // Verify green sum
          let sumG = 0;
          activeKeys.forEach(k => { sumG += candGreens[k]; });
          if (sumG !== totalEffectiveGreen) continue;

          const candSim = SimulationEngine.simulatePlan(activeApproaches, candGreens, simConfig);
          evaluationsCount++;

          const candScore = evaluateBalancedCandidateScore(candSim, currentSimResult, activeKeys, initialSimResult);

          // Require a meaningful score improvement
          if (candScore < currentBestScore - 0.05) {
            currentBestScore  = candScore;
            currentBestGreens = candGreens;
            currentBestSim    = candSim;
            foundNeighborImprovement = true;
            improvedInStage3  = true;
            break; // Greedy hill-climbing: accept first improving neighbor and restart
          }
        }
        if (foundNeighborImprovement) break;
      }

      iterationsCount++;
      if (!foundNeighborImprovement) break; // Reached local optimum
    }

    let refinementStatus = 'STAGE 2 RETAINED';
    if (improvedInStage3) {
      refinementStatus = 'IMPROVED';
    }

    const refinementSummary = {
      status: refinementStatus,
      evaluationsCount: evaluationsCount,
      iterationsCount: iterationsCount,
      stage2NetworkDelay: Math.round(stage2NetworkDelay * 10) / 10,
      finalNetworkDelay: Math.round(currentBestSim.overallAvgWaitTime * 10) / 10,
      stage2MaxQueue: Math.round(stage2MaxQueue),
      finalMaxQueue: Math.round(currentBestSim.overallMaxQueue),
      worstApproachDelayBefore: Math.round(stage2WorstDelay * 10) / 10,
      worstApproachDelayAfter: Math.round(currentBestSim.maxApproachWaitTime * 10) / 10
    };

    return {
      finalGreens: currentBestGreens,
      finalSimResult: currentBestSim,
      refinementStatus: refinementStatus,
      evaluationsCount: evaluationsCount,
      refinementSummary: refinementSummary
    };
  }

  /**
   * Calculate Pedestrian Crossing Time
   * Formula: Pedestrian Crossing Time = Start-up Time + (Crossing Width / Walking Speed)
   */
  function calculatePedestrianCrossingTime(crossingWidth, walkingSpeed, startUpTime) {
    const width   = parseFloat(crossingWidth) > 0 ? parseFloat(crossingWidth) : 14.0;
    const speed   = parseFloat(walkingSpeed) > 0 ? parseFloat(walkingSpeed) : 1.2;
    const startUp = (startUpTime !== undefined && startUpTime !== null && startUpTime !== '' && !isNaN(parseFloat(startUpTime)))
      ? parseFloat(startUpTime) : 7.0;

    const walkTime    = width / speed;
    const totalTime   = startUp + walkTime;
    const totalCeil   = Math.ceil(totalTime);
    const roundedTime = Math.round(totalTime * 10) / 10;

    return {
      crossingWidth: width,
      walkingSpeed: speed,
      startUpTime: startUp,
      walkTime: Math.round(walkTime * 10) / 10,
      totalTime: roundedTime,
      totalTimeCeil: totalCeil,
      formulaText: `Crossing Time = ${startUp.toFixed(1)}s (Start-up) + (${width.toFixed(1)}m / ${speed.toFixed(1)}m/s) = ${roundedTime.toFixed(1)}s`
    };
  }

  /**
   * Three-Stage Signal Timing Optimizer with Civil Engineering Pedestrian Safety Constraints:
   * Stage 1: Initial Candidate Generation (Unconstrained network delay optimizer).
   * Stage 2: Multi-Objective Balanced Candidate Search (Fairness & deterioration penalties).
   * Stage 3: Iterative Simulation-Validated Refinement (Deterministic local search over neighboring feasible plans).
   */
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

    // Pedestrian Model Integration
    const enablePedestrian = Boolean(
      intersectionConfig.enablePedestrian === true ||
      intersectionConfig.enablePedestrian === 'true' ||
      intersectionConfig.enablePedestrian === 'YES' ||
      intersectionConfig.enablePedestrian === 'Yes'
    );

    const pedModel = calculatePedestrianCrossingTime(
      intersectionConfig.crossingWidth,
      intersectionConfig.walkingSpeed,
      intersectionConfig.startUpTime
    );

    // Effective Minimum Green bound
    let effectiveGMin = gMin;
    let pedBudgetOverflow = false;
    if (enablePedestrian) {
      effectiveGMin = Math.max(gMin, pedModel.totalTimeCeil);
      if (nActive * effectiveGMin > totalEffectiveGreen) {
        pedBudgetOverflow = true;
        effectiveGMin = Math.max(gMin, Math.floor(totalEffectiveGreen / nActive));
      }
    }

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

    // Helper to execute 3-stage optimization given a minimum green bound
    function runOptimizationLoop(searchGMin) {
      let stage1Greens = { ...rawCurrentGreens };
      let stage1BestScore = Infinity;
      let stage1SimResult = null;

      if (nActive === 4) {
        const [k0, k1, k2, k3] = activeKeys;
        for (let g0 = searchGMin; g0 <= gMax; g0++) {
          for (let g1 = searchGMin; g1 <= gMax; g1++) {
            for (let g2 = searchGMin; g2 <= gMax; g2++) {
              const g3 = totalEffectiveGreen - (g0 + g1 + g2);
              if (g3 >= searchGMin && g3 <= gMax) {
                const candGreens = { [k0]: g0, [k1]: g1, [k2]: g2, [k3]: g3 };
                const candSim = SimulationEngine.simulatePlan(activeApproaches, candGreens, simConfig);
                const score = candSim.overallAvgWaitTime || Infinity;
                if (score < stage1BestScore) {
                  stage1BestScore = score;
                  stage1Greens = candGreens;
                  stage1SimResult = candSim;
                }
              }
            }
          }
        }
      } else if (nActive === 3) {
        const [k0, k1, k2] = activeKeys;
        for (let g0 = searchGMin; g0 <= gMax; g0++) {
          for (let g1 = searchGMin; g1 <= gMax; g1++) {
            const g2 = totalEffectiveGreen - (g0 + g1);
            if (g2 >= searchGMin && g2 <= gMax) {
              const candGreens = { [k0]: g0, [k1]: g1, [k2]: g2 };
              const candSim = SimulationEngine.simulatePlan(activeApproaches, candGreens, simConfig);
              const score = candSim.overallAvgWaitTime || Infinity;
              if (score < stage1BestScore) {
                stage1BestScore = score;
                stage1Greens = candGreens;
                stage1SimResult = candSim;
              }
            }
          }
        }
      }

      if (!stage1SimResult) {
        stage1SimResult = SimulationEngine.simulatePlan(activeApproaches, stage1Greens, simConfig);
      }

      let stage2BestScore = Infinity;
      let stage2Greens = { ...rawCurrentGreens };
      let stage2SimResult = null;

      if (nActive === 4) {
        const [k0, k1, k2, k3] = activeKeys;
        for (let g0 = searchGMin; g0 <= gMax; g0++) {
          for (let g1 = searchGMin; g1 <= gMax; g1++) {
            for (let g2 = searchGMin; g2 <= gMax; g2++) {
              const g3 = totalEffectiveGreen - (g0 + g1 + g2);
              if (g3 >= searchGMin && g3 <= gMax) {
                const candGreens = { [k0]: g0, [k1]: g1, [k2]: g2, [k3]: g3 };
                const candSim = SimulationEngine.simulatePlan(activeApproaches, candGreens, simConfig);
                const score = evaluateBalancedCandidateScore(candSim, currentSimResult, activeKeys, stage1SimResult);
                if (score < stage2BestScore) {
                  stage2BestScore = score;
                  stage2Greens = candGreens;
                  stage2SimResult = candSim;
                }
              }
            }
          }
        }
      } else if (nActive === 3) {
        const [k0, k1, k2] = activeKeys;
        for (let g0 = searchGMin; g0 <= gMax; g0++) {
          for (let g1 = searchGMin; g1 <= gMax; g1++) {
            const g2 = totalEffectiveGreen - (g0 + g1);
            if (g2 >= searchGMin && g2 <= gMax) {
              const candGreens = { [k0]: g0, [k1]: g1, [k2]: g2 };
              const candSim = SimulationEngine.simulatePlan(activeApproaches, candGreens, simConfig);
              const score = evaluateBalancedCandidateScore(candSim, currentSimResult, activeKeys, stage1SimResult);
              if (score < stage2BestScore) {
                stage2BestScore = score;
                stage2Greens = candGreens;
                stage2SimResult = candSim;
              }
            }
          }
        }
      }

      if (!stage2SimResult) {
        stage2Greens = { ...stage1Greens };
        stage2SimResult = stage1SimResult;
      }

      const stage3Res = refineSignalTimings(
        stage2Greens,
        activeApproaches,
        simConfig,
        currentSimResult,
        stage1SimResult,
        analysisData,
        searchGMin,
        gMax,
        totalEffectiveGreen
      );

      return {
        stage1Greens,
        stage1SimResult,
        stage2Greens,
        stage2SimResult,
        finalGreens: stage3Res.finalGreens,
        finalSimResult: stage3Res.finalSimResult,
        refinementStatus: stage3Res.refinementStatus,
        refinementSummary: stage3Res.refinementSummary,
        evaluationsCount: stage3Res.evaluationsCount
      };
    }

    // Run baseline pure traffic optimization (without ped constraints) if ped mode enabled, to calculate explainability delta
    let pureTrafficOpt = null;
    if (enablePedestrian && effectiveGMin > gMin) {
      pureTrafficOpt = runOptimizationLoop(gMin);
    }

    // Run active optimization with effectiveGMin
    const optRes = runOptimizationLoop(effectiveGMin);

    const initialGreens     = optRes.stage1Greens;
    const initialSimResult  = optRes.stage1SimResult;
    const balancedGreens    = optRes.stage2Greens;
    const balancedSimResult = optRes.stage2SimResult;
    const finalGreens       = optRes.finalGreens;
    const finalSimResult    = optRes.finalSimResult;
    const refinementStatus  = optRes.refinementStatus;
    const refinementSummary = optRes.refinementSummary;

    // Run central Validation Layer on FINAL STAGE 3 PLAN
    const valRes = (typeof CongestionEngine !== 'undefined' && CongestionEngine.validateCandidatePlan)
      ? CongestionEngine.validateCandidatePlan(activeKeys, currentSimResult, finalSimResult, { approaches: activeApproaches, initialSim: initialSimResult })
      : { status: (finalSimResult.overallAvgWaitTime < currentOverallWait ? 'RECOMMENDED' : 'NOT RECOMMENDED'), summaryText: '', worsenedApproaches: [] };

    const acceptanceStatus = valRes.status;

    // Pedestrian Safety Validation & Explainability
    let overallPedestrianSafe = true;
    const pedestrianExplanations = [];
    const recommendation = {};

    activeKeys.forEach(k => {
      const currG  = rawCurrentGreens[k];
      const initG  = initialGreens[k];
      const balG   = balancedGreens[k];
      const finalG = finalGreens[k];

      const currW  = currentSimResult.approaches[k] ? currentSimResult.approaches[k].avgWaitTime : 0;
      const initW  = initialSimResult.approaches[k] ? initialSimResult.approaches[k].avgWaitTime : 0;
      const balW   = balancedSimResult.approaches[k] ? balancedSimResult.approaches[k].avgWaitTime : 0;
      const finalW = finalSimResult.approaches[k] ? finalSimResult.approaches[k].avgWaitTime : 0;

      const appName = activeApproaches[k] ? (activeApproaches[k].name || k) : k;

      let isPedSafe = true;
      let pedStatusLabel = '✓ Pedestrian Safe';
      let pedReason = 'Recommended green time satisfies required pedestrian crossing time.';

      if (enablePedestrian) {
        if (finalG < pedModel.totalTime) {
          isPedSafe = false;
          overallPedestrianSafe = false;
          pedStatusLabel = '✗ Pedestrian Crossing Time Not Satisfied';
          pedReason = `Recommended green (${finalG} s) is less than required pedestrian crossing time (${pedModel.totalTime} s).`;
        }

        // Explainability check: Did pedestrian constraint increase green time?
        if (pureTrafficOpt && pureTrafficOpt.finalGreens) {
          const pureG = pureTrafficOpt.finalGreens[k];
          if (finalG > pureG && pureG < pedModel.totalTime) {
            const expText = `Green time for ${appName} increased from ${pureG} s to ${finalG} s to satisfy pedestrian crossing safety.`;
            pedestrianExplanations.push(expText);
          }
        }
      }

      recommendation[k] = {
        id: activeApproaches[k] ? activeApproaches[k].id : k,
        name: appName,
        flow: activeApproaches[k] ? activeApproaches[k].flow : 0,
        currentGreen: currG,
        initialGreen: initG,
        balancedGreen: balG,
        proposedGreen: finalG, // FINAL STAGE 3 GREEN
        difference: finalG - currG,
        currentWait: currW,
        initialWait: initW,
        balancedWait: balW,
        proposedWait: finalW,
        isOversaturated: finalSimResult.approaches[k] ? finalSimResult.approaches[k].isOversaturated : false,
        // Pedestrian metrics per approach
        pedestrianSafe: isPedSafe,
        pedestrianStatusLabel: pedStatusLabel,
        pedestrianReason: pedReason,
        requiredPedestrianTime: pedModel.totalTime
      };
    });

    if (enablePedestrian && pedBudgetOverflow) {
      overallPedestrianSafe = false;
      pedestrianExplanations.unshift(`✗ Pedestrian Crossing Time Not Satisfied: Required total pedestrian crossing green times (${nActive * pedModel.totalTimeCeil}s) exceed available effective green budget (${totalEffectiveGreen}s). Consider increasing cycle length or reducing crossing width.`);
    }

    const pedestrianSummary = {
      enabled: enablePedestrian,
      crossingWidth: pedModel.crossingWidth,
      walkingSpeed: pedModel.walkingSpeed,
      startUpTime: pedModel.startUpTime,
      requiredCrossingTime: pedModel.totalTime,
      requiredCrossingTimeCeil: pedModel.totalTimeCeil,
      formulaText: pedModel.formulaText,
      overallSafe: enablePedestrian ? overallPedestrianSafe : true,
      statusLabel: enablePedestrian
        ? (overallPedestrianSafe ? 'SAFE' : 'Needs Longer Green')
        : 'DISABLED',
      badgeClass: enablePedestrian
        ? (overallPedestrianSafe ? 'badge-low' : 'badge-severe')
        : 'badge-moderate',
      explanations: pedestrianExplanations,
      explanationText: pedestrianExplanations.join(' ')
    };

    let explanation = valRes.summaryText || generateExplanation(activeApproaches, recommendation, acceptanceStatus, currentSimResult, finalSimResult, activeKeys, valRes.worsenedApproaches);
    if (enablePedestrian && pedestrianExplanations.length > 0) {
      explanation += ` [PEDESTRIAN SAFETY CONSTRAINT: ${pedestrianExplanations.join(' ')}]`;
    }

    return {
      configType: configType,
      activeKeys: activeKeys,
      totalEffectiveGreen: totalEffectiveGreen,
      totalLostTime: totalLostTime,
      acceptanceStatus: acceptanceStatus,
      isRecommended: acceptanceStatus === 'RECOMMENDED',
      isConditional: acceptanceStatus === 'CONDITIONAL',
      isNotRecommended: acceptanceStatus === 'NOT RECOMMENDED',
      validationResult: valRes,
      worsenedApproaches: valRes.worsenedApproaches || [],
      currentOverallWait: currentSimResult.overallAvgWaitTime,
      initialOverallWait: initialSimResult.overallAvgWaitTime,
      balancedOverallWait: balancedSimResult.overallAvgWaitTime,
      proposedOverallWait: finalSimResult.overallAvgWaitTime,
      waitImprovementPct: currentSimResult.overallAvgWaitTime > 0 ? Math.round(((currentSimResult.overallAvgWaitTime - finalSimResult.overallAvgWaitTime) / currentSimResult.overallAvgWaitTime) * 1000) / 10 : 0,
      recommendation: recommendation,
      currentSimResult: currentSimResult,
      initialSimResult: initialSimResult,
      balancedSimResult: balancedSimResult,
      proposedSimResult: finalSimResult,
      explanation: explanation,
      refinementSummary: refinementSummary,
      pedestrianSummary: pedestrianSummary,
      stage1: { greens: initialGreens, simResult: initialSimResult },
      stage2: { greens: balancedGreens, simResult: balancedSimResult },
      stage3: { greens: finalGreens, simResult: finalSimResult, status: refinementStatus, evaluationsCount: optRes.evaluationsCount }
    };
  }

  /**
   * Milestone 6.4 Multi-Objective Objective Function for Balanced Optimization
   * Objective = Network Avg Delay + Max Delay Penalty + Delay Spread Penalty + Approach Worsening Penalties + Oversaturation Penalty
   */
  function evaluateBalancedCandidateScore(candSim, currentSimResult, activeKeys, initialSimResult) {
    const overallWait = candSim.overallAvgWaitTime || 0;
    const currentOverall = currentSimResult ? (currentSimResult.overallAvgWaitTime || 0) : 0;
    const maxWait = candSim.maxApproachWaitTime || 0;
    
    const delays = activeKeys.map(k => (candSim.approaches[k] ? candSim.approaches[k].avgWaitTime || 0 : 0));
    const minWait = Math.min(...delays);
    const spread = maxWait - minWait;

    let penalty = 0;

    // 1. Primary goal: overall network delay improvement over baseline
    const delayDiff = overallWait - currentOverall;
    if (currentOverall > 0 && delayDiff > -0.5) {
      penalty += 150 + Math.max(0, delayDiff) * 50; // Heavy penalty if plan fails to achieve network delay reduction
    }

    // 2. Approach deterioration penalty for noticeable/severe delay increases relative to baseline
    activeKeys.forEach(k => {
      const cWait = currentSimResult.approaches[k] ? (currentSimResult.approaches[k].avgWaitTime || 0) : 0;
      const bWait = candSim.approaches[k] ? (candSim.approaches[k].avgWaitTime || 0) : 0;
      const cVC   = currentSimResult.approaches[k] ? (currentSimResult.approaches[k].vcRatio || 0) : 0;
      const bVC   = candSim.approaches[k] ? (candSim.approaches[k].vcRatio || 0) : 0;

      const deltaWait = bWait - cWait;

      if (deltaWait > 15 && bWait > 45) {
        penalty += Math.pow((deltaWait - 15) / 5, 2) * PROTOTYPE_OPTIMIZATION_WEIGHTS.DETERIORATION_PENALTY_MULT;
      }
      if (bWait > 60) {
        penalty += 200; // Severe delay spike barrier (>60s)
      }

      // 3. Oversaturation penalty
      if (bVC > 1.0 && cVC <= 1.0) {
        penalty += PROTOTYPE_OPTIMIZATION_WEIGHTS.OVERSATURATION_PENALTY;
      } else if (bVC > 1.0 && cVC > 1.0) {
        penalty += 50 * (bVC - cVC);
      }
    });

    return (
      PROTOTYPE_OPTIMIZATION_WEIGHTS.NETWORK_DELAY_WEIGHT * 2.0 * overallWait +
      PROTOTYPE_OPTIMIZATION_WEIGHTS.MAX_APPROACH_DELAY_WEIGHT * maxWait +
      PROTOTYPE_OPTIMIZATION_WEIGHTS.DELAY_SPREAD_WEIGHT * spread +
      penalty
    );
  }

  function generateExplanation(approaches, recMap, status, currentSim, bestSim, activeKeys, worsenedApproaches = []) {
    if (status === 'NOT RECOMMENDED') {
      return "NOT RECOMMENDED: Green redistribution alone cannot provide acceptable approach-level performance under the current demand and cycle constraints. Retaining current signal timings is recommended.";
    }

    let highestDemandApp = activeKeys[0];
    let maxFlow = -1;
    activeKeys.forEach(k => {
      const f = approaches[k] ? approaches[k].flow : 0;
      if (f > maxFlow) {
        maxFlow = f;
        highestDemandApp = approaches[k] ? (approaches[k].name || k) : k;
      }
    });

    const waitDiff = Math.abs(Math.round((bestSim.overallAvgWaitTime - currentSim.overallAvgWaitTime) * 10) / 10);

    if (status === 'CONDITIONAL') {
      const listStr = worsenedApproaches.map(w => `${w.name} (+${w.delta}s delay)`).join(', ');
      return `CONDITIONAL RECOMMENDATION: Overall network delay improves by ${waitDiff}s/veh (from ${currentSim.overallAvgWaitTime.toFixed(1)}s to ${bestSim.overallAvgWaitTime.toFixed(1)}s), but specific approach(es) experience trade-offs: ${listStr}. Consider local queue mitigation or cycle length review before deployment.`;
    }

    return `BALANCED OPTIMIZATION RECOMMENDED: Overall network average delay is reduced by ${waitDiff}s/veh (from ${currentSim.overallAvgWaitTime.toFixed(1)}s to ${bestSim.overallAvgWaitTime.toFixed(1)}s). Green times were allocated proportionally based on approach demand while protecting all active approaches from severe delay deterioration and maintaining safety green thresholds.`;
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
      return { pathD: `M ${inX} 290 L ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: (inX + outX) / 2, symY: 450, symChar: '\u2193' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[Math.floor(eInLanes / 2)];
      const outY = getOutboundLaneCenters('west', wInLanes)[0];
      return { pathD: `M 610 ${inY} L 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 450, symY: (inY + outY) / 2, symChar: '\u2190' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[Math.floor(sInLanes / 2)];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M ${inX} 610 L ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: (inX + outX) / 2, symY: 450, symChar: '\u2191' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[Math.floor(wInLanes / 2)];
      const outY = getOutboundLaneCenters('east', eInLanes)[0];
      return { pathD: `M 290 ${inY} L 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 450, symY: (inY + outY) / 2, symChar: '\u2192' };
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
      return { pathD: `M ${inX} 290 C ${inX} 390, 510 ${outY}, 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 520, symY: 380, symChar: '\u21b0' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[0];
      const outX = getOutboundLaneCenters('south', sInLanes)[0];
      return { pathD: `M 610 ${inY} C 510 ${inY}, ${outX} 510, ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: 520, symY: 520, symChar: '\u21b0' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[0];
      const outY = getOutboundLaneCenters('west', wInLanes)[0];
      return { pathD: `M ${inX} 610 C ${inX} 510, 390 ${outY}, 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 380, symY: 520, symChar: '\u21b0' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[0];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M 290 ${inY} C 390 ${inY}, ${outX} 390, ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: 380, symY: 380, symChar: '\u21b0' };
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
      return { pathD: `M ${inX} 290 C ${inX} 360, 360 ${outY}, 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 360, symY: 360, symChar: '\u21b1' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[eInLanes - 1];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M 610 ${inY} C 540 ${inY}, ${outX} 360, ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: 540, symY: 360, symChar: '\u21b1' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[sInLanes - 1];
      const outY = getOutboundLaneCenters('east', eInLanes)[0];
      return { pathD: `M ${inX} 610 C ${inX} 540, 540 ${outY}, 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 540, symY: 540, symChar: '\u21b1' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[wInLanes - 1];
      const outX = getOutboundLaneCenters('south', sInLanes)[0];
      return { pathD: `M 290 ${inY} C 360 ${inY}, ${outX} 540, ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: 360, symY: 540, symChar: '\u21b1' };
    }
    return { pathD: '', endX: 0, endY: 0, dir: 'south', symX: 0, symY: 0, symChar: '' };
  }

  function generateMovementMappingData(approaches, configType = '4CROSS') {
    const origins = ['north', 'east', 'south', 'west'];
    const mTypes  = ['left', 'through', 'right'];
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
      return { pathD: `M ${inX} 290 L ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: (inX + outX) / 2, symY: 450, symChar: '\u2193' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[Math.floor(eInLanes / 2)];
      const outY = getOutboundLaneCenters('west', wInLanes)[0];
      return { pathD: `M 610 ${inY} L 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 450, symY: (inY + outY) / 2, symChar: '\u2190' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[Math.floor(sInLanes / 2)];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M ${inX} 610 L ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: (inX + outX) / 2, symY: 450, symChar: '\u2191' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[Math.floor(wInLanes / 2)];
      const outY = getOutboundLaneCenters('east', eInLanes)[0];
      return { pathD: `M 290 ${inY} L 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 450, symY: (inY + outY) / 2, symChar: '\u2192' };
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
      return { pathD: `M ${inX} 290 C ${inX} 390, 510 ${outY}, 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 520, symY: 380, symChar: '\u21b0' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[0];
      const outX = getOutboundLaneCenters('south', sInLanes)[0];
      return { pathD: `M 610 ${inY} C 510 ${inY}, ${outX} 510, ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: 520, symY: 520, symChar: '\u21b0' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[0];
      const outY = getOutboundLaneCenters('west', wInLanes)[0];
      return { pathD: `M ${inX} 610 C ${inX} 510, 390 ${outY}, 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 380, symY: 520, symChar: '\u21b0' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[0];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M 290 ${inY} C 390 ${inY}, ${outX} 390, ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: 380, symY: 380, symChar: '\u21b0' };
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
      return { pathD: `M ${inX} 290 C ${inX} 360, 360 ${outY}, 290 ${outY}`, endX: 290, endY: outY, dir: 'west', symX: 360, symY: 360, symChar: '\u21b1' };
    } else if (origin === 'east') {
      const inY = getInboundLaneCenters('east', eInLanes)[eInLanes - 1];
      const outX = getOutboundLaneCenters('north', nInLanes)[0];
      return { pathD: `M 610 ${inY} C 540 ${inY}, ${outX} 360, ${outX} 290`, endX: outX, endY: 290, dir: 'north', symX: 540, symY: 360, symChar: '\u21b1' };
    } else if (origin === 'south') {
      const inX = getInboundLaneCenters('south', sInLanes)[sInLanes - 1];
      const outY = getOutboundLaneCenters('east', eInLanes)[0];
      return { pathD: `M ${inX} 610 C ${inX} 540, 540 ${outY}, 610 ${outY}`, endX: 610, endY: outY, dir: 'east', symX: 540, symY: 540, symChar: '\u21b1' };
    } else if (origin === 'west') {
      const inY = getInboundLaneCenters('west', wInLanes)[wInLanes - 1];
      const outX = getOutboundLaneCenters('south', sInLanes)[0];
      return { pathD: `M 290 ${inY} C 360 ${inY}, ${outX} 540, ${outX} 610`, endX: outX, endY: 610, dir: 'south', symX: 360, symY: 540, symChar: '\u21b1' };
    }
    return { pathD: '', endX: 0, endY: 0, dir: 'south', symX: 0, symY: 0, symChar: '' };
  }

  function generateMovementMappingData(approaches, configType = '4CROSS') {
    const origins = ['north', 'east', 'south', 'west'];
    const mTypes  = ['left', 'through', 'right'];
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

  function renderIntersectionSVG(containerId, analysisData, selectedOrigin = 'north', selectedMovement = 'ALL') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const configType = analysisData.configType || '4CROSS';
    const activeKeys = analysisData.activeKeys || ['north', 'east', 'south', 'west'];
    const apps = analysisData.approaches || {};

    const hasNorth = activeKeys.includes('north');
    const hasEast  = activeKeys.includes('east');
    const hasSouth = activeKeys.includes('south');
    const hasWest  = activeKeys.includes('west');

    const fullNameMap = {
      north: 'ROAD A \u2014 NORTH',
      east:  'ROAD B \u2014 EAST',
      south: 'ROAD C \u2014 SOUTH',
      west:  'ROAD D \u2014 WEST'
    };

    let baseRoadsHTML = '';
    let permanentWhiteArrowsHTML = '';
    let movementPathsHTML = '';
    let signalsHTML = '';
    let curbsHTML = '';

    // Corner Curbs & Absent Arm Boundary Lines (3-Arm Support)
    const nwCurb = (hasNorth && hasWest)
      ? `<path d="M ${450 - MEDIAN_WIDTH/2 - (apps.north?.lanes||2)*LANE_WIDTH} 290 Q 290 290 290 ${450 - MEDIAN_WIDTH/2 - (apps.west?.lanes||2)*LANE_WIDTH}" stroke="#f8fafc" stroke-width="4" fill="none"/>`
      : '';
    const neCurb = (hasNorth && hasEast)
      ? `<path d="M ${450 + MEDIAN_WIDTH/2 + (apps.north?.lanes||2)*LANE_WIDTH} 290 Q 610 290 610 ${450 - MEDIAN_WIDTH/2 - (apps.east?.lanes||2)*LANE_WIDTH}" stroke="#f8fafc" stroke-width="4" fill="none"/>`
      : '';
    const seCurb = (hasSouth && hasEast)
      ? `<path d="M ${450 + MEDIAN_WIDTH/2 + (apps.south?.lanes||2)*LANE_WIDTH} 610 Q 610 610 610 ${450 + MEDIAN_WIDTH/2 + (apps.east?.lanes||2)*LANE_WIDTH}" stroke="#f8fafc" stroke-width="4" fill="none"/>`
      : '';
    const swCurb = (hasSouth && hasWest)
      ? `<path d="M ${450 - MEDIAN_WIDTH/2 - (apps.south?.lanes||2)*LANE_WIDTH} 610 Q 290 610 290 ${450 + MEDIAN_WIDTH/2 + (apps.west?.lanes||2)*LANE_WIDTH}" stroke="#f8fafc" stroke-width="4" fill="none"/>`
      : '';

    curbsHTML = nwCurb + neCurb + seCurb + swCurb;

    if (!hasNorth) curbsHTML += `<line x1="290" y1="290" x2="610" y2="290" stroke="#f8fafc" stroke-width="6" />`;
    if (!hasEast)  curbsHTML += `<line x1="610" y1="290" x2="610" y2="610" stroke="#f8fafc" stroke-width="6" />`;
    if (!hasSouth) curbsHTML += `<line x1="290" y1="610" x2="610" y2="610" stroke="#f8fafc" stroke-width="6" />`;
    if (!hasWest)  curbsHTML += `<line x1="290" y1="290" x2="290" y2="610" stroke="#f8fafc" stroke-width="6" />`;

    // 1. NORTH ROAD (Road A)
    if (hasNorth) {
      const app = apps.north || {};
      const nLanes = Math.max(1, Math.min(3, parseInt(app.lanes, 10) || 2));
      const inCenters = getInboundLaneCenters('north', nLanes);
      const outCenters = getOutboundLaneCenters('north', nLanes);
      const xLeft = outCenters[0] - LANE_WIDTH / 2;
      const xRight = inCenters[nLanes - 1] + LANE_WIDTH / 2;

      baseRoadsHTML += `
        <!-- North Asphalt -->
        <rect x="${xLeft}" y="60" width="${xRight - xLeft}" height="230" fill="#1e293b" />
        <!-- Central Median -->
        <line x1="450" y1="60" x2="450" y2="290" stroke="#f59e0b" stroke-width="4" stroke-dasharray="10 8" />
        <!-- Stop Line (IN Carriageway - Right half) -->
        <line x1="455" y1="290" x2="${xRight}" y2="290" stroke="#ffffff" stroke-width="6" />
        <!-- Crosswalk Stripes -->
        <g stroke="#ffffff" stroke-width="4" opacity="0.8">
          ${Array.from({length: Math.floor((xRight - xLeft)/14)}).map((_, i) => '<line x1="' + (xLeft + 5 + i*14) + '" y1="265" x2="' + (xLeft + 5 + i*14) + '" y2="282" />').join('')}
        </g>
        <!-- Outer Road Title (Outside top canvas edge) -->
        <text x="450" y="38" fill="#f8fafc" font-size="16" font-weight="bold" text-anchor="middle">ROAD A \u2014 NORTH (${nLanes} Lanes / Direction)</text>
      `;

      // OUT Lanes (West half) - Northbound \u2191
      outCenters.forEach(cx => {
        permanentWhiteArrowsHTML += `
          <g opacity="0.9">
            <line x1="${cx}" y1="200" x2="${cx}" y2="130" stroke="#ffffff" stroke-width="3.5" />
            <polygon points="${cx},120 ${cx - 7},135 ${cx + 7},135" fill="#ffffff" />
          </g>
        `;
      });
      baseRoadsHTML += `<text x="${(xLeft + 445)/2}" y="225" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">OUT \u2191</text>`;

      // IN Lanes (East half) - Southbound \u2193
      inCenters.forEach(cx => {
        permanentWhiteArrowsHTML += `
          <g opacity="0.9">
            <line x1="${cx}" y1="130" x2="${cx}" y2="200" stroke="#ffffff" stroke-width="3.5" />
            <polygon points="${cx},210 ${cx - 7},195 ${cx + 7},195" fill="#ffffff" />
          </g>
        `;
      });
      baseRoadsHTML += `<text x="${(455 + xRight)/2}" y="115" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">IN \u2193</text>`;

      // Lane dividers
      for (let i = 1; i < nLanes; i++) {
        const divOutX = 445 - i * LANE_WIDTH;
        const divInX = 455 + i * LANE_WIDTH;
        baseRoadsHTML += `<line x1="${divOutX}" y1="60" x2="${divOutX}" y2="265" stroke="#64748b" stroke-width="1.5" stroke-dasharray="6 6" />`;
        baseRoadsHTML += `<line x1="${divInX}" y1="60" x2="${divInX}" y2="265" stroke="#64748b" stroke-width="1.5" stroke-dasharray="6 6" />`;
      }

      // Signal Light at Stop Line
      signalsHTML += `
        <g transform="translate(${xRight + 8}, 265)">
          <rect x="0" y="0" width="16" height="36" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5"/>
          <circle cx="8" cy="7" r="3.5" fill="#ef4444"/>
          <circle cx="8" cy="18" r="3.5" fill="#f59e0b"/>
          <circle cx="8" cy="29" r="3.5" fill="#10b981"/>
        </g>
      `;
    }

    // 2. EAST ROAD (Road B)
    if (hasEast) {
      const app = apps.east || {};
      const eLanes = Math.max(1, Math.min(3, parseInt(app.lanes, 10) || 2));
      const inCenters = getInboundLaneCenters('east', eLanes);
      const outCenters = getOutboundLaneCenters('east', eLanes);
      const yTop = outCenters[0] - LANE_WIDTH / 2;
      const yBottom = inCenters[eLanes - 1] + LANE_WIDTH / 2;

      baseRoadsHTML += `
        <!-- East Asphalt -->
        <rect x="610" y="${yTop}" width="230" height="${yBottom - yTop}" fill="#1e293b" />
        <!-- Central Median -->
        <line x1="610" y1="450" x2="840" y2="450" stroke="#f59e0b" stroke-width="4" stroke-dasharray="10 8" />
        <!-- Stop Line (IN Carriageway - Bottom half) -->
        <line x1="610" y1="455" x2="610" y2="${yBottom}" stroke="#ffffff" stroke-width="6" />
        <!-- Crosswalk Stripes -->
        <g stroke="#ffffff" stroke-width="4" opacity="0.8">
          ${Array.from({length: Math.floor((yBottom - yTop)/14)}).map((_, i) => '<line x1="618" y1="' + (yTop + 5 + i*14) + '" x2="635" y2="' + (yTop + 5 + i*14) + '" />').join('')}
        </g>
        <!-- Outer Road Title (Outside right canvas edge) -->
        <text x="862" y="455" fill="#f8fafc" font-size="15" font-weight="bold" text-anchor="start" writing-mode="tb" glyph-orientation-vertical="0">ROAD B \u2014 EAST (${eLanes} Lanes)</text>
      `;

      // OUT Lanes (Top half) - Eastbound \u2192
      outCenters.forEach(cy => {
        permanentWhiteArrowsHTML += `
          <g opacity="0.9">
            <line x1="700" y1="${cy}" x2="770" y2="${cy}" stroke="#ffffff" stroke-width="3.5" />
            <polygon points="780,${cy} 765,${cy - 7} 765,${cy + 7}" fill="#ffffff" />
          </g>
        `;
      });
      baseRoadsHTML += `<text x="675" y="${(yTop + 445)/2 + 4}" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">OUT \u2192</text>`;

      // IN Lanes (Bottom half) - Westbound \u2190
      inCenters.forEach(cy => {
        permanentWhiteArrowsHTML += `
          <g opacity="0.9">
            <line x1="770" y1="${cy}" x2="700" y2="${cy}" stroke="#ffffff" stroke-width="3.5" />
            <polygon points="690,${cy} 705,${cy - 7} 705,${cy + 7}" fill="#ffffff" />
          </g>
        `;
      });
      baseRoadsHTML += `<text x="785" y="${(455 + yBottom)/2 + 4}" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">IN \u2190</text>`;

      // Lane dividers
      for (let i = 1; i < eLanes; i++) {
        const divOutY = 445 - i * LANE_WIDTH;
        const divInY = 455 + i * LANE_WIDTH;
        baseRoadsHTML += `<line x1="635" y1="${divOutY}" x2="840" y2="${divOutY}" stroke="#64748b" stroke-width="1.5" stroke-dasharray="6 6" />`;
        baseRoadsHTML += `<line x1="635" y1="${divInY}" x2="840" y2="${divInY}" stroke="#64748b" stroke-width="1.5" stroke-dasharray="6 6" />`;
      }

      // Signal Light at Stop Line
      signalsHTML += `
        <g transform="translate(615, ${yBottom + 12})">
          <rect x="0" y="0" width="36" height="16" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5"/>
          <circle cx="7" cy="8" r="3.5" fill="#ef4444"/>
          <circle cx="18" cy="8" r="3.5" fill="#f59e0b"/>
          <circle cx="29" cy="8" r="3.5" fill="#10b981"/>
        </g>
      `;
    }

    // 3. SOUTH ROAD (Road C)
    if (hasSouth) {
      const app = apps.south || {};
      const sLanes = Math.max(1, Math.min(3, parseInt(app.lanes, 10) || 2));
      const inCenters = getInboundLaneCenters('south', sLanes);
      const outCenters = getOutboundLaneCenters('south', sLanes);
      const xLeft = inCenters[sLanes - 1] - LANE_WIDTH / 2;
      const xRight = outCenters[sLanes - 1] + LANE_WIDTH / 2;

      baseRoadsHTML += `
        <!-- South Asphalt -->
        <rect x="${xLeft}" y="610" width="${xRight - xLeft}" height="230" fill="#1e293b" />
        <!-- Central Median -->
        <line x1="450" y1="610" x2="450" y2="840" stroke="#f59e0b" stroke-width="4" stroke-dasharray="10 8" />
        <!-- Stop Line (IN Carriageway - Left half) -->
        <line x1="${xLeft}" y1="610" x2="445" stroke="#ffffff" stroke-width="6" />
        <!-- Crosswalk Stripes -->
        <g stroke="#ffffff" stroke-width="4" opacity="0.8">
          ${Array.from({length: Math.floor((xRight - xLeft)/14)}).map((_, i) => '<line x1="' + (xLeft + 5 + i*14) + '" y1="618" x2="' + (xLeft + 5 + i*14) + '" y2="635" />').join('')}
        </g>
        <!-- Outer Road Title (Outside bottom canvas edge) -->
        <text x="450" y="872" fill="#f8fafc" font-size="16" font-weight="bold" text-anchor="middle">ROAD C \u2014 SOUTH (${sLanes} Lanes / Direction)</text>
      `;

      // IN Lanes (West half) - Northbound \u2191
      inCenters.forEach(cx => {
        permanentWhiteArrowsHTML += `
          <g opacity="0.9">
            <line x1="${cx}" y1="770" x2="${cx}" y2="700" stroke="#ffffff" stroke-width="3.5" />
            <polygon points="${cx},690 ${cx - 7},705 ${cx + 7},705" fill="#ffffff" />
          </g>
        `;
      });
      baseRoadsHTML += `<text x="${(xLeft + 445)/2}" y="785" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">IN \u2191</text>`;

      // OUT Lanes (East half) - Southbound \u2193
      outCenters.forEach(cx => {
        permanentWhiteArrowsHTML += `
          <g opacity="0.9">
            <line x1="${cx}" y1="700" x2="${cx}" y2="770" stroke="#ffffff" stroke-width="3.5" />
            <polygon points="${cx},780 ${cx - 7},765 ${cx + 7},765" fill="#ffffff" />
          </g>
        `;
      });
      baseRoadsHTML += `<text x="${(455 + xRight)/2}" y="675" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">OUT \u2193</text>`;

      // Lane dividers
      for (let i = 1; i < sLanes; i++) {
        const divInX = 445 - i * LANE_WIDTH;
        const divOutX = 455 + i * LANE_WIDTH;
        baseRoadsHTML += `<line x1="${divInX}" y1="635" x2="${divInX}" y2="840" stroke="#64748b" stroke-width="1.5" stroke-dasharray="6 6" />`;
        baseRoadsHTML += `<line x1="${divOutX}" y1="635" x2="${divOutX}" y2="840" stroke="#64748b" stroke-width="1.5" stroke-dasharray="6 6" />`;
      }

      // Signal Light at Stop Line
      signalsHTML += `
        <g transform="translate(${xLeft - 24}, 600)">
          <rect x="0" y="0" width="16" height="36" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5"/>
          <circle cx="8" cy="7" r="3.5" fill="#ef4444"/>
          <circle cx="8" cy="18" r="3.5" fill="#f59e0b"/>
          <circle cx="8" cy="29" r="3.5" fill="#10b981"/>
        </g>
      `;
    }

    // 4. WEST ROAD (Road D)
    if (hasWest) {
      const app = apps.west || {};
      const wLanes = Math.max(1, Math.min(3, parseInt(app.lanes, 10) || 2));
      const inCenters = getInboundLaneCenters('west', wLanes);
      const outCenters = getOutboundLaneCenters('west', wLanes);
      const yTop = outCenters[wLanes - 1] - LANE_WIDTH / 2;
      const yBottom = inCenters[wLanes - 1] + LANE_WIDTH / 2;

      baseRoadsHTML += `
        <!-- West Asphalt -->
        <rect x="60" y="${yTop}" width="230" height="${yBottom - yTop}" fill="#1e293b" />
        <!-- Central Median -->
        <line x1="60" y1="450" x2="290" y2="450" stroke="#f59e0b" stroke-width="4" stroke-dasharray="10 8" />
        <!-- Stop Line (IN Carriageway - Bottom half) -->
        <line x1="290" y1="455" x2="290" y2="${yBottom}" stroke="#ffffff" stroke-width="6" />
        <!-- Crosswalk Stripes -->
        <g stroke="#ffffff" stroke-width="4" opacity="0.8">
          ${Array.from({length: Math.floor((yBottom - yTop)/14)}).map((_, i) => '<line x1="265" y1="' + (yTop + 5 + i*14) + '" x2="' + (yTop + 5 + i*14) + '" y2="282" />').join('')}
        </g>
        <!-- Outer Road Title (Outside left canvas edge) -->
        <text x="35" y="455" fill="#f8fafc" font-size="15" font-weight="bold" text-anchor="end" writing-mode="tb" glyph-orientation-vertical="0">ROAD D \u2014 WEST (${wLanes} Lanes)</text>
      `;

      // OUT Lanes (Top half) - Westbound \u2190
      outCenters.forEach(cy => {
        permanentWhiteArrowsHTML += `
          <g opacity="0.9">
            <line x1="200" y1="${cy}" x2="130" y2="${cy}" stroke="#ffffff" stroke-width="3.5" />
            <polygon points="120,${cy} 135,${cy - 7} 135,${cy + 7}" fill="#ffffff" />
          </g>
        `;
      });
      baseRoadsHTML += `<text x="115" y="${(yTop + 445)/2 + 4}" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">OUT \u2190</text>`;

      // IN Lanes (Bottom half) - Eastbound \u2192
      inCenters.forEach(cy => {
        permanentWhiteArrowsHTML += `
          <g opacity="0.9">
            <line x1="130" y1="${cy}" x2="200" y2="${cy}" stroke="#ffffff" stroke-width="3.5" />
            <polygon points="210,${cy} 195,${cy - 7} 195,${cy + 7}" fill="#ffffff" />
          </g>
        `;
      });
      baseRoadsHTML += `<text x="225" y="${(455 + yBottom)/2 + 4}" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">IN \u2192</text>`;

      // Lane dividers
      for (let i = 1; i < wLanes; i++) {
        const divOutY = 445 - i * LANE_WIDTH;
        const divInY = 455 + i * LANE_WIDTH;
        baseRoadsHTML += `<line x1="60" y1="${divOutY}" x2="265" y2="${divOutY}" stroke="#64748b" stroke-width="1.5" stroke-dasharray="6 6" />`;
        baseRoadsHTML += `<line x1="60" y1="${divInY}" x2="265" y2="${divInY}" stroke="#64748b" stroke-width="1.5" stroke-dasharray="6 6" />`;
      }

      // Signal Light at Stop Line
      signalsHTML += `
        <g transform="translate(250, ${yBottom + 12})">
          <rect x="0" y="0" width="36" height="16" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5"/>
          <circle cx="7" cy="8" r="3.5" fill="#ef4444"/>
          <circle cx="18" cy="8" r="3.5" fill="#f59e0b"/>
          <circle cx="29" cy="8" r="3.5" fill="#10b981"/>
        </g>
      `;
    }

    // Central Conflict Box (Dashed yellow box in middle)
    const centerConflictBox = `
      <rect x="380" y="380" width="140" height="140" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" opacity="0.8" />
    `;

    const mappings = generateMovementMappingData(apps, configType);

    mappings.forEach(m => {
      if (!m.isValid || !m.volume || m.volume <= 0) return;

      const isOriginMatch = (selectedOrigin === 'ALL' || selectedOrigin === m.originKey);
      const isMoveMatch   = (selectedMovement === 'ALL' || selectedMovement === m.movementType);
      const isHighlighted = isOriginMatch && isMoveMatch;

      const strokeColor = m.movementType === 'left' ? '#38bdf8' : (m.movementType === 'through' ? '#10b981' : '#f59e0b');
      const strokeWidth = selectedOrigin === 'ALL' ? (isHighlighted ? 2.5 : 1.0) : (isHighlighted ? 5.0 : 1.0);
      const opacity = selectedOrigin === 'ALL' ? (isHighlighted ? 0.45 : 0.08) : (isHighlighted ? 1.0 : 0.05);

      let arrowHeadPoly = '';
      if (m.dir === 'south') {
        arrowHeadPoly = `${m.endX},${m.endY} ${m.endX - 7},${m.endY - 14} ${m.endX + 7},${m.endY - 14}`;
      } else if (m.dir === 'north') {
        arrowHeadPoly = `${m.endX},${m.endY} ${m.endX - 7},${m.endY + 14} ${m.endX + 7},${m.endY + 14}`;
      } else if (m.dir === 'east') {
        arrowHeadPoly = `${m.endX},${m.endY} ${m.endX - 14},${m.endY - 7} ${m.endX - 14},${m.endY + 7}`;
      } else if (m.dir === 'west') {
        arrowHeadPoly = `${m.endX},${m.endY} ${m.endX + 14},${m.endY - 7} ${m.endX + 14},${m.endY + 7}`;
      }

      const tooltipText = `FROM: ${fullNameMap[m.originKey]} | MOVEMENT: ${m.movementType.toUpperCase()} | TO: ${fullNameMap[m.destKey]}`;

      movementPathsHTML += `
        <g class="movement-path-group" opacity="${opacity}" style="transition: opacity 0.3s ease; cursor: pointer;">
          <path d="${m.pathD}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" />
          <polygon points="${arrowHeadPoly}" fill="${strokeColor}" />
          <circle cx="${m.symX}" cy="${m.symY}" r="12" fill="#0f172a" stroke="${strokeColor}" stroke-width="2.5" />
          <text x="${m.symX}" y="${m.symY + 4}" fill="${strokeColor}" font-size="12" font-weight="bold" text-anchor="middle">${symbol}</text>
          <title>${tooltipText}</title>
        </g>
      `;
    });
  }

  // Centralized Direction Configuration (Single Source of Truth for IN/OUT geometry)
  const DIRECTION_CONFIG = {
    north: {
      key: 'north',
      id: 'A',
      roadName: 'ROAD A \u2014 NORTH',
      inboundVector:  { dx: 0, dy: 1, arrow: '\u2193', label: 'IN' },   // SOUTHBOUND (toward intersection)
      outboundVector: { dx: 0, dy: -1, arrow: '\u2191', label: 'OUT' }, // NORTHBOUND (away from intersection)
      inboundSide: 'right',
      outboundSide: 'left',
      inColor: '#38bdf8',
      outColor: '#22c55e'
    },
    east: {
      key: 'east',
      id: 'B',
      roadName: 'ROAD B \u2014 EAST',
      inboundVector:  { dx: -1, dy: 0, arrow: '\u2190', label: 'IN' },  // WESTBOUND (toward intersection)
      outboundVector: { dx: 1, dy: 0, arrow: '\u2192', label: 'OUT' },  // EASTBOUND (away from intersection)
      inboundSide: 'bottom',
      outboundSide: 'top',
      inColor: '#38bdf8',
      outColor: '#22c55e'
    },
    south: {
      key: 'south',
      id: 'C',
      roadName: 'ROAD C \u2014 SOUTH',
      inboundVector:  { dx: 0, dy: -1, arrow: '\u2191', label: 'IN' },  // NORTHBOUND (toward intersection)
      outboundVector: { dx: 0, dy: 1, arrow: '\u2193', label: 'OUT' },  // SOUTHBOUND (away from intersection)
      inboundSide: 'left',
      outboundSide: 'right',
      inColor: '#38bdf8',
      outColor: '#22c55e'
    },
    west: {
      key: 'west',
      id: 'D',
      roadName: 'ROAD D \u2014 WEST',
      inboundVector:  { dx: 1, dy: 0, arrow: '\u2192', label: 'IN' },   // EASTBOUND (toward intersection)
      outboundVector: { dx: -1, dy: 0, arrow: '\u2190', label: 'OUT' },  // WESTBOUND (away from intersection)
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
        in:  { start: { x: 440, y: 100 }, end: { x: 440, y: 260 }, expected: '\u2193', check: (dx, dy) => dy > 0 },
        out: { start: { x: 360, y: 260 }, end: { x: 360, y: 100 }, expected: '\u2191', check: (dx, dy) => dy < 0 }
      },
      east: {
        in:  { start: { x: 700, y: 440 }, end: { x: 540, y: 440 }, expected: '\u2190', check: (dx, dy) => dx < 0 },
        out: { start: { x: 540, y: 360 }, end: { x: 700, y: 360 }, expected: '\u2192', check: (dx, dy) => dx > 0 }
      },
      south: {
        in:  { start: { x: 360, y: 700 }, end: { x: 360, y: 540 }, expected: '\u2191', check: (dx, dy) => dy < 0 },
        out: { start: { x: 440, y: 540 }, end: { x: 440, y: 700 }, expected: '\u2193', check: (dx, dy) => dy > 0 }
      },
      west: {
        in:  { start: { x: 100, y: 360 }, end: { x: 260, y: 360 }, expected: '\u2192', check: (dx, dy) => dx > 0 },
        out: { start: { x: 260, y: 440 }, end: { x: 200, y: 440 }, expected: '\u2190', check: (dx, dy) => dx < 0 }
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
          errors.push('FAILED assertion for ' + cfg.roadName + ' ' + (type ? type.toUpperCase() : '') + ': vecOk=' + vecOk + ', distOk=' + distOk);
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
    const hasEast  = activeKeys.includes('east');
    const hasSouth = activeKeys.includes('south');
    const hasWest  = activeKeys.includes('west');

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

      // OUT Lane (Left: x=360, UP \u2191) - Green arrows
      directionArrowsHTML += `
        <g>
          <line x1="360" y1="270" x2="360" y2="190" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-up)" />
          <line x1="360" y1="170" x2="360" y2="90" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-up)" />
          <text x="360" y="75" fill="#22c55e" font-size="16" font-weight="800" text-anchor="middle">OUT</text>
        </g>
      `;

      // IN Lane (Right: x=440, DOWN \u2193) - Blue arrows
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
          <text x="90" y="21" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">ROAD A \u2014 NORTH</text>
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

      // OUT Lane (Top: y=360, RIGHT \u2192) - Green arrows
      directionArrowsHTML += `
        <g>
          <line x1="530" y1="360" x2="610" y2="360" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-right)" />
          <line x1="630" y1="360" x2="710" y2="360" stroke="#22c55e" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-green-right)" />
          <text x="735" y="365" fill="#22c55e" font-size="16" font-weight="800" text-anchor="start">OUT</text>
        </g>
      `;

      // IN Lane (Bottom: y=440, LEFT \u2190) - Blue arrows
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
          <text x="80" y="21" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">ROAD B \u2014 EAST</text>
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

      // IN Lane (Left: x=360, UP \u2191) - Blue arrows
      directionArrowsHTML += `
        <g>
          <line x1="360" y1="710" x2="360" y2="630" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-up)" />
          <line x1="360" y1="610" x2="360" y2="530" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-up)" />
          <text x="360" y="735" fill="#38bdf8" font-size="16" font-weight="800" text-anchor="middle">IN</text>
        </g>
      `;

      // OUT Lane (Right: x=440, DOWN \u2193) - Green arrows
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
          <text x="90" y="21" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">ROAD C \u2014 SOUTH</text>
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

      // IN Lane (Top: y=360, RIGHT \u2192) - Blue arrows
      directionArrowsHTML += `
        <g>
          <line x1="90" y1="360" x2="170" y2="360" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-right)" />
          <line x1="190" y1="360" x2="270" y2="360" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow-blue-right)" />
          <text x="65" y="365" fill="#38bdf8" font-size="16" font-weight="800" text-anchor="end">IN</text>
        </g>
      `;

      // OUT Lane (Bottom: y=440, LEFT \u2190) - Green arrows
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
          <text x="80" y="21" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">ROAD D \u2014 WEST</text>
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
          <text x="16" y="48" fill="#cbd5e1" font-size="12">\u2022 IN = Towards Intersection</text>
          <text x="16" y="72" fill="#cbd5e1" font-size="12">\u2022 OUT = Away from Intersection</text>
          <text x="16" y="96" fill="#cbd5e1" font-size="12">\u2022 Green/Blue = Flow Direction</text>
          <text x="16" y="116" fill="#cbd5e1" font-size="12">\u2022 Stop line only on IN lanes</text>
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
    calculatePedestrianCrossingTime,
    renderIntersectionSVG,
    generateMovementMappingData
  };
})();
if (typeof window !== 'undefined') { window.AnalysisEngine = AnalysisEngine; }
if (typeof module !== 'undefined' && module.exports) { module.exports = AnalysisEngine; }

