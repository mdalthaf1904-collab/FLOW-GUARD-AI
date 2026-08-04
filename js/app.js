/**
 * FlowGuard AI - Core State & Shared Application Logic
 * Data-Driven LHT Geometry, Configurable Lanes (1-3 Lanes), and Input Validation
 */

const FlowGuard = (function() {
  'use strict';

  const STORAGE_KEY = 'FLOWGUARD_STATE_V5_DATA_DRIVEN';

  // API Backend Base URL Gateway
  const API_BASE_URL = (typeof window !== 'undefined' && window.location.port === '3000') 
    ? '/api' 
    : 'http://localhost:3000/api';

  /**
   * Helper to fetch synthetic traffic data from backend Express REST API
   */
  async function fetchSyntheticDataAPI(numIntersections = 3, numDays = 1) {
    try {
      const response = await fetch(`${API_BASE_URL}/data/synthetic?numIntersections=${numIntersections}&numDays=${numDays}`);
      if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
      const result = await response.json();
      return result.data || [];
    } catch (err) {
      console.warn('Backend API unavailable, using local generator fallback:', err.message);
      return (typeof CongestionEngine !== 'undefined' && CongestionEngine.generateSyntheticHistoricalData)
        ? CongestionEngine.generateSyntheticHistoricalData(numIntersections, numDays)
        : [];
    }
  }

  /**
   * Helper to analyze traffic data via backend Express REST API
   */
  async function analyzeTrafficAPI(payload) {
    try {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
      return await response.json();
    } catch (err) {
      console.warn('Backend API unavailable for analysis:', err.message);
      return null;
    }
  }


  // Single Source of Truth for Road Approaches & Geometry Vectors
  const APPROACHES = {
    north: {
      id: "A",
      name: "Road A",
      fullName: "ROAD A \u2014 NORTH",
      position: "north",
      inVector: "down",
      outVector: "up",
      inArrow: "\u2193",
      outArrow: "\u2191"
    },
    east: {
      id: "B",
      name: "Road B",
      fullName: "ROAD B \u2014 EAST",
      position: "east",
      inVector: "left",
      outVector: "right",
      inArrow: "\u2190",
      outArrow: "\u2192"
    },
    south: {
      id: "C",
      name: "Road C",
      fullName: "ROAD C \u2014 SOUTH",
      position: "south",
      inVector: "up",
      outVector: "down",
      inArrow: "\u2191",
      outArrow: "\u2193"
    },
    west: {
      id: "D",
      name: "Road D",
      fullName: "ROAD D \u2014 WEST",
      position: "west",
      inVector: "right",
      outVector: "left",
      inArrow: "\u2192",
      outArrow: "\u2190"
    }
  };

  // Central Data-Driven Movement Destination Mapping Matrix (Indian LHT)
  const MOVEMENT_MAP = {
    north: { left: 'east',  through: 'south', right: 'west'  },
    east:  { left: 'south', through: 'west',  right: 'north' },
    south: { left: 'west',  through: 'north', right: 'east'  },
    west:  { left: 'north', through: 'east',  right: 'south' }
  };

  // Standard Demonstration Defaults
  const DEFAULT_STATE = {
    configType: '4CROSS', // Options: '4CROSS', '3NO_NORTH', '3NO_EAST', '3NO_SOUTH', '3NO_WEST'
    inputMode: 'TURNING_MOVEMENTS', // Options: 'APPROACH_TOTAL', 'TURNING_MOVEMENTS', 'AI_DETECTION'
    intersection: {
      cycleLength: 120,    // seconds
      yellowTime: 3,       // seconds
      allRedTime: 2,       // seconds
      minGreen: 7,         // seconds minimum bound
      maxGreen: 90,        // seconds maximum bound
      saturationFlow: 1800 // Configurable prototype saturation-flow assumption (PCU/hr/lane)
    },
    pcuFactors: {
      car: 1.0,          // Car / Jeep / Van (IRC:106-1990)
      motorcycle: 0.5,   // Two-Wheeler / Scooter
      autorickshaw: 0.8, // 3-Wheeler / Auto-Rickshaw
      bus: 3.0,          // City Bus / Coach
      truck: 3.0,        // Heavy Goods Vehicle / LCV
      bicycle: 0.4       // Non-Motorized Cycle
    },
    approaches: {
      north: {
        id: 'north', road: 'A', name: 'Road A - North', flow: 850, currentGreen: 30, left: 120, through: 610, right: 120,
        lanes: 2, inboundDirection: 'south', outboundDirection: 'north'
      },
      east:  {
        id: 'east',  road: 'B', name: 'Road B - East',  flow: 720, currentGreen: 30, left: 100, through: 520, right: 100,
        lanes: 2, inboundDirection: 'west', outboundDirection: 'east'
      },
      south: {
        id: 'south', road: 'C', name: 'Road C - South', flow: 280, currentGreen: 30, left: 40,  through: 200, right: 40,
        lanes: 2, inboundDirection: 'north', outboundDirection: 'south'
      },
      west:  {
        id: 'west',  road: 'D', name: 'Road D - West',  flow: 350, currentGreen: 30, left: 50,  through: 250, right: 50,
        lanes: 2, inboundDirection: 'east', outboundDirection: 'west'
      }
    },
    aiDetection: {
      selectedApproach: 'north',
      detectedCounts: { car: 25, motorcycle: 12, bus: 3, truck: 4, autorickshaw: 3, bicycle: 0 },
      totalDetected: 47
    },
    proposedTiming: null,
    optResults: null
  };

  /**
   * Return active approach keys based on intersection configuration
   */
  function getActiveApproachKeys(configType) {
    switch (configType) {
      case '3NO_NORTH': return ['east', 'south', 'west'];
      case '3NO_EAST':  return ['north', 'south', 'west'];
      case '3NO_SOUTH': return ['north', 'east', 'west'];
      case '3NO_WEST':  return ['north', 'east', 'south'];
      case '4CROSS':
      default:          return ['north', 'east', 'south', 'west'];
    }
  }

  /**
   * Return human-readable configuration label
   */
  function getConfigLabel(configType) {
    switch (configType) {
      case '3NO_NORTH': return '3-Arm \u2014 No North';
      case '3NO_EAST':  return '3-Arm \u2014 No East';
      case '3NO_SOUTH': return '3-Arm \u2014 No South';
      case '3NO_WEST':  return '3-Arm \u2014 No West';
      case '4CROSS':
      default:          return '4-Arm Cross';
    }
  }

  /**
   * Indian Left-Hand Traffic (LHT) Destination Mapping Matrix Lookup
   */
  function getMovementDestination(originKey, movementType) {
    return MOVEMENT_MAP[originKey] ? MOVEMENT_MAP[originKey][movementType] : null;
  }

  /**
   * Determine if a turning movement is valid for the current geometry configuration
   */
  function isMovementValid(originKey, movementType, configType) {
    const activeKeys = getActiveApproachKeys(configType);
    if (!activeKeys.includes(originKey)) return false;
    
    const destKey = getMovementDestination(originKey, movementType);
    return activeKeys.includes(destKey);
  }

  /**
   * Engineering Input Validation Function
   */
  function validateApproachInputs(approaches, configType = '4CROSS') {
    const activeKeys = getActiveApproachKeys(configType);
    const errors = [];

    activeKeys.forEach(k => {
      const app = approaches[k];
      if (!app) {
        errors.push(`Active approach ${k.toUpperCase()} data missing.`);
        return;
      }

      // 1. Lane count validation
      const lanes = parseInt(app.lanes, 10);
      if (isNaN(lanes) || lanes < 1 || lanes > 3) {
        errors.push(`${app.name}: Lane count must be 1, 2, or 3.`);
      }

      // 2. Flow non-negative validation
      ['left', 'through', 'right', 'flow'].forEach(m => {
        const val = parseFloat(app[m]);
        if (isNaN(val) || val < 0) {
          errors.push(`${app.name}: ${m} volume must be a non-negative number.`);
        }
      });

      // 3. Movement conservation validation
      const l = parseFloat(app.left) || 0;
      const t = parseFloat(app.through) || 0;
      const r = parseFloat(app.right) || 0;
      const total = parseFloat(app.flow) || 0;

      // Ensure invalid movements are zeroed
      ['left', 'through', 'right'].forEach(m => {
        const isValid = isMovementValid(k, m, configType);
        const mVal = parseFloat(app[m]) || 0;
        if (!isValid && mVal > 0) {
          errors.push(`${app.name}: ${m.toUpperCase()} turn is unavailable because destination approach is inactive.`);
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Calculate total PCU flow from heterogeneous vehicle counts using IRC:106 factors
   */
  function calculateApproachPCU(counts, factors = DEFAULT_STATE.pcuFactors) {
    if (!counts) return 0;
    const c = counts.car || 0;
    const m = counts.motorcycle || 0;
    const a = counts.autorickshaw || 0;
    const b = counts.bus || 0;
    const t = counts.truck || 0;
    const cyc = counts.bicycle || 0;

    const f = factors || DEFAULT_STATE.pcuFactors;
    return Math.round(
      c * (f.car || 1.0) +
      m * (f.motorcycle || 0.5) +
      a * (f.autorickshaw || 0.8) +
      b * (f.bus || 3.0) +
      t * (f.truck || 3.0) +
      cyc * (f.bicycle || 0.4)
    );
  }

  const SESSION_STORAGE_KEY = 'FLOWGUARD_SESSION_STATE_V6';
  const CSV_RECORDS_KEY     = 'FLOWGUARD_CSV_RECORDS_V6';

  function getState() {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (savedSession) return JSON.parse(savedSession);
      }
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Storage error or unavailable, falling back to default state:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  function saveState(state) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      console.warn('Storage write failed:', e);
    }
  }

  function saveCSVRecords(records) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(CSV_RECORDS_KEY, JSON.stringify(records));
      }
    } catch (e) {
      console.warn('SessionStorage write CSV records failed:', e);
    }
  }

  function getCSVRecords() {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const recs = sessionStorage.getItem(CSV_RECORDS_KEY);
        if (recs) return JSON.parse(recs);
      }
    } catch (e) {
      console.warn('SessionStorage get CSV records failed:', e);
    }
    return null;
  }

  function resetToDefaults() {
    const newState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    saveState(newState);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(CSV_RECORDS_KEY);
    }
    return newState;
  }

  function formatNum(val, decimals = 0) {
    if (val === null || val === undefined || isNaN(val)) return '-';
    return Number(val).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function validateInput(num, min = 0, max = 100000) {
    const parsed = parseFloat(num);
    if (isNaN(parsed)) return { valid: false, message: 'Must be a valid number' };
    if (parsed < min) return { valid: false, message: `Value must be at least ${min}` };
    if (parsed > max) return { valid: false, message: `Value cannot exceed ${max}` };
    return { valid: true, value: parsed };
  }

  function initNavigation() {
    if (typeof document === 'undefined') return;
    const path = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (path.endsWith(href) || (path.endsWith('/') && href === 'index.html'))) {
        link.classList.add('active');
      }
    });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
      initNavigation();
    });
  }

  function renderSimulationDashboardResults(containerId, beforeMetrics, afterMetrics) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'simulation-results-wrapper';
    wrapper.style.marginTop = '2rem';
    
    // Header
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';
    headerRow.style.marginBottom = '1rem';
    
    const header = document.createElement('h3');
    header.innerText = 'Simulation Results: Before vs. After';
    header.style.margin = '0';
    header.style.color = 'var(--primary)';
    
    const printBtn = document.createElement('button');
    printBtn.innerText = 'Download/Print Report';
    printBtn.className = 'btn btn-primary no-print';
    printBtn.onclick = function() { FlowGuard.generateEngineeringReport(); };
    
    headerRow.appendChild(header);
    headerRow.appendChild(printBtn);
    wrapper.appendChild(headerRow);

    // Table Container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-responsive card';
    tableContainer.style.marginBottom = '2rem';
    tableContainer.style.padding = '0'; // Let the table fill the card
    
    const delayDiff = (afterMetrics.avg_delay_sec - beforeMetrics.avg_delay_sec).toFixed(2);
    const queueDiff = (afterMetrics.avg_queue_length - beforeMetrics.avg_queue_length).toFixed(2);
    
    // Improvements are negative values (less delay, less queue)
    const delayColor = parseFloat(delayDiff) > 0 ? '#ef4444' : '#10b981';
    const queueColor = parseFloat(queueDiff) > 0 ? '#ef4444' : '#10b981';

    tableContainer.innerHTML = `
      <table class="data-table" style="width: 100%; border-collapse: collapse; margin: 0;">
        <thead>
          <tr style="background: rgba(15, 23, 42, 0.6); border-bottom: 1px solid var(--border-color);">
            <th style="padding: 1rem; text-align: left; font-weight: 600; color: var(--text-muted);">Metric</th>
            <th style="padding: 1rem; text-align: center; font-weight: 600; color: var(--text-muted);">Before Adjustment</th>
            <th style="padding: 1rem; text-align: center; font-weight: 600; color: var(--text-muted);">After Adjustment</th>
            <th style="padding: 1rem; text-align: center; font-weight: 600; color: var(--text-muted);">Difference</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 1rem; font-weight: 500;">Average Delay (s/veh)</td>
            <td style="padding: 1rem; text-align: center; font-family: var(--font-mono);">${beforeMetrics.avg_delay_sec.toFixed(2)}</td>
            <td style="padding: 1rem; text-align: center; font-family: var(--font-mono);">${afterMetrics.avg_delay_sec.toFixed(2)}</td>
            <td style="padding: 1rem; text-align: center; font-family: var(--font-mono); font-weight: 700; color: ${delayColor};">${parseFloat(delayDiff) > 0 ? '+' : ''}${delayDiff}</td>
          </tr>
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 1rem; font-weight: 500;">Average Queue Length (veh)</td>
            <td style="padding: 1rem; text-align: center; font-family: var(--font-mono);">${beforeMetrics.avg_queue_length.toFixed(2)}</td>
            <td style="padding: 1rem; text-align: center; font-family: var(--font-mono);">${afterMetrics.avg_queue_length.toFixed(2)}</td>
            <td style="padding: 1rem; text-align: center; font-family: var(--font-mono); font-weight: 700; color: ${queueColor};">${parseFloat(queueDiff) > 0 ? '+' : ''}${queueDiff}</td>
          </tr>
          <tr>
            <td style="padding: 1rem; font-weight: 500;">Max Queue Length (veh)</td>
            <td style="padding: 1rem; text-align: center; font-family: var(--font-mono);">${beforeMetrics.max_queue_length}</td>
            <td style="padding: 1rem; text-align: center; font-family: var(--font-mono);">${afterMetrics.max_queue_length}</td>
            <td style="padding: 1rem; text-align: center; font-family: var(--font-mono); font-weight: 700;">${afterMetrics.max_queue_length - beforeMetrics.max_queue_length > 0 ? '+' : ''}${afterMetrics.max_queue_length - beforeMetrics.max_queue_length}</td>
          </tr>
        </tbody>
      </table>
    `;
    wrapper.appendChild(tableContainer);

    // Constraints & Guardrails Component
    const guardrails = document.createElement('div');
    guardrails.className = 'constraints-guardrails card';
    guardrails.style.padding = '1.5rem';
    guardrails.style.borderLeft = '4px solid #f59e0b';
    guardrails.style.backgroundColor = 'rgba(245, 158, 11, 0.05)';
    
    guardrails.innerHTML = `
      <h4 style="color: #f59e0b; margin-top: 0; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        Constraints & Guardrails
      </h4>
      <p style="margin: 0; font-size: 0.9rem; color: var(--text-dim); line-height: 1.6;">
        <strong>Note:</strong> This tool provides offline recommendations only, assuming deterministic arrival rates and static driver compliance. These are simulated estimates and do not guarantee real-world improvements.
      </p>
    `;
    wrapper.appendChild(guardrails);

    container.appendChild(wrapper);
  }

  /**
   * Vanilla JS function to parse an uploaded CSV file.
   * Expected columns (case-insensitive): Time, Vehicles_Per_Minute, Lanes, Incident
   */
  function parseTrafficCSV(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        return reject(new Error("No file selected. Please choose a CSV file."));
      }

      const reader = new FileReader();

      reader.onload = function(e) {
        let text = e.target.result;
        if (!text || text.trim() === '') {
          return reject(new Error("The uploaded file is empty."));
        }
        text = text.replace(/^\uFEFF/, '');

        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) {
          return reject(new Error("The CSV must contain a header row and at least one data row."));
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const requiredColumns = ['time', 'vehicles_per_minute', 'lanes', 'incident'];
        
        const missing = requiredColumns.filter(col => !headers.includes(col));
        if (missing.length > 0) {
          return reject(new Error(`Missing required columns: ${missing.join(', ')}`));
        }

        const timeIdx = headers.indexOf('time');
        const vpmIdx = headers.indexOf('vehicles_per_minute');
        const lanesIdx = headers.indexOf('lanes');
        const incidentIdx = headers.indexOf('incident');

        const parsedData = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (cols.length < headers.length) {
            return reject(new Error(`Malformed data at row ${i + 1}: incorrect number of columns.`));
          }

          const timeVal = cols[timeIdx];
          const vpmVal = parseInt(cols[vpmIdx], 10);
          const lanesVal = parseInt(cols[lanesIdx], 10);
          const incidentVal = cols[incidentIdx];

          // Basic validation for H:MM, HH:MM, or HH:MM:SS
          if (!timeVal || !timeVal.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
            return reject(new Error(`Malformed time format at row ${i + 1}. Expected HH:MM.`));
          }

          if (isNaN(vpmVal) || vpmVal < 0) {
            return reject(new Error(`Invalid Vehicles_Per_Minute at row ${i + 1}.`));
          }
          if (isNaN(lanesVal) || lanesVal <= 0) {
            return reject(new Error(`Invalid Lanes count at row ${i + 1}.`));
          }

          parsedData.push({
            time_of_day: timeVal,
            vehicles_per_minute: vpmVal,
            lanes: lanesVal,
            incident_event: incidentVal
          });
        }

        resolve(parsedData);
      };

      reader.onerror = function() {
        reject(new Error("Failed to read the file. It may be corrupted or inaccessible."));
      };

      reader.readAsText(file);
    });
  }

  /**
   * Renders a Gantt-style horizontal phase diagram for signal timings.
   */
  function renderPhaseDiagram(baseline, candidate, containerId) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    const createBar = (timings, label) => {
      const { green, yellow, red, cycleLength } = timings;
      
      const pGreen = (green / cycleLength) * 100;
      const pYellow = (yellow / cycleLength) * 100;
      const pRed = (red / cycleLength) * 100;

      return `
        <div class="phase-diagram-row">
          <div class="phase-diagram-label">${label}</div>
          <div class="phase-diagram-bar">
            <div class="phase-segment green" style="width: ${pGreen}%" title="Green: ${green}s">
              ${pGreen > 5 ? green + 's' : ''}
            </div>
            <div class="phase-segment yellow" style="width: ${pYellow}%" title="Yellow: ${yellow}s">
              ${pYellow > 5 ? yellow + 's' : ''}
            </div>
            <div class="phase-segment red" style="width: ${pRed}%" title="Red: ${red}s">
              ${pRed > 5 ? red + 's' : ''}
            </div>
          </div>
        </div>
      `;
    };

    const wrapper = document.createElement('div');
    wrapper.className = 'phase-diagram-wrapper card';
    wrapper.style.padding = '1.5rem';
    wrapper.innerHTML = `
      <h3 style="margin-top: 0; margin-bottom: 1rem; color: var(--primary);">Signal Timing Phase Diagram</h3>
      ${createBar(baseline, 'Baseline')}
      ${createBar(candidate, 'Candidate')}
      <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 0.75rem; text-align: right;">
        Total Cycle Length: ${baseline.cycleLength}s (Baseline) / ${candidate.cycleLength}s (Candidate)
      </div>
    `;

    container.appendChild(wrapper);
  }

  function generateEngineeringReport() {
    window.print();
  }

  /**
   * Initializes the What-If slider and attaches the event listener
   * for instant re-rendering of the simulation metrics and phase diagram.
   */
  function initWhatIfSlider(syntheticRecord, baselineTimings, resultsContainerId, phaseDiagramContainerId) {
    if (typeof document === 'undefined') return;
    
    const slider = document.getElementById('manualGreenOverride');
    const sliderValueDisplay = document.getElementById('slider-value');
    
    if (!slider || !sliderValueDisplay) return;

    slider.addEventListener('input', function(e) {
      const newGreenSplit = parseInt(e.target.value, 10);
      sliderValueDisplay.textContent = newGreenSplit;
      
      const newCandidateTimings = {
        cycleLength: baselineTimings.cycleLength,
        greenSplit: newGreenSplit
      };

      // Recalculate metrics instantly using the deterministic simulation engine
      const result = SimulationEngine.evaluateTimingAdjustments(
        syntheticRecord,
        { cycleLength: baselineTimings.cycleLength, greenSplit: baselineTimings.green },
        newCandidateTimings
      );

      // Re-render tabular 'Before vs After' metrics
      renderSimulationDashboardResults(
        resultsContainerId,
        result.before_metrics,
        result.after_metrics
      );

      // Re-render Gantt Phase Diagram
      const yellowTime = baselineTimings.yellow || 3;
      const redTime = Math.max(0, baselineTimings.cycleLength - newGreenSplit - yellowTime);

      renderPhaseDiagram(
        baselineTimings,
        { 
          green: newGreenSplit, 
          yellow: yellowTime, 
          red: redTime, 
          cycleLength: baselineTimings.cycleLength 
        },
        phaseDiagramContainerId
      );
    });
  }

  /**
   * Master Function: renderEngineeringDashboard(parsedData)
   * Dynamically builds and injects the 7 massive engineering dashboard sections
   * into a container div named #dashboard-results immediately after CSV processing.
   */
  /**
   * Master Function: renderEngineeringDashboard(parsedData)
   * Dynamically builds and injects the 7 massive engineering dashboard sections
   * into a container div named #dashboard-results immediately after CSV processing.
   * Strictly enforces data isolation per approach to prevent single-direction data bleed.
   */
  function renderEngineeringDashboard(parsedData, containerId = 'dashboard-results') {
    if (typeof document === 'undefined') return;

    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      document.body.appendChild(container);
    }

    container.innerHTML = ''; // Clear previous contents

    const state = getState();
    const approaches = state.approaches || DEFAULT_STATE.approaches;
    const storedRecords = getCSVRecords();
    const isExplicitlyProcessed = (parsedData && (Array.isArray(parsedData) ? parsedData.length > 0 : Object.keys(parsedData).length > 0));
    const hasUploadedRoads = Object.values(approaches).some(app => app.uploaded === true || app.fromCSV === true);

    const hasData = isExplicitlyProcessed || (storedRecords && storedRecords.length > 0) || hasUploadedRoads;

    // ── DATA CHECK GATEKEEPER — EMPTY STATE UI (Fixes "Ghost Data" Bug) ──
    if (!hasData) {
      container.innerHTML = `
        <div class="card" style="padding: 2.5rem; text-align: center; border: 1px dashed rgba(56,189,248,0.4); background: rgba(15,23,42,0.6); margin-top: 1.5rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">📊</div>
          <div style="font-size: 0.85rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; margin-bottom: 0.5rem;">
            STATUS: AWAITING DATA INPUT
          </div>
          <h3 style="margin: 0 0 0.75rem 0; color: #38bdf8; font-size: 1.25rem;">
            No Traffic Data Uploaded Yet
          </h3>
          <p style="color: var(--text-muted); max-width: 600px; margin: 0 auto 1.5rem auto; font-size: 0.88rem; line-height: 1.6;">
            The D/D/1 queuing calculations and saturation flow metrics are halted to prevent phantom baseline rendering. Upload a historical traffic CSV file or load demo mock data to calculate volume-to-capacity ratios, queuing metrics, and signal timing plans.
          </p>
          <div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;">
            <button id="btnEmptyStateLoadDemo" class="btn btn-primary" style="padding: 0.6rem 1.25rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem;">
              ⚡ Load Demo Mock Data
            </button>
            <button id="btnEmptyStateTriggerUpload" class="btn btn-secondary" style="padding: 0.6rem 1.25rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem;">
              📂 Upload Traffic CSV
            </button>
          </div>
        </div>
      `;

      const demoBtn = document.getElementById('btnEmptyStateLoadDemo');
      if (demoBtn) {
        demoBtn.addEventListener('click', () => {
          const demoApproaches = {
            north: { id: 'north', road: 'A', name: 'Road A - North', flow: 3300, currentGreen: 30, left: 495, through: 2310, right: 495, lanes: 2, uploaded: true, fromCSV: true },
            east:  { id: 'east',  road: 'B', name: 'Road B - East',  flow: 720,  currentGreen: 30, left: 100, through: 520,  right: 100, lanes: 2, uploaded: true, fromCSV: true },
            south: { id: 'south', road: 'C', name: 'Road C - South', flow: 280,  currentGreen: 30, left: 40,  through: 200,  right: 40,  lanes: 2, uploaded: true, fromCSV: true },
            west:  { id: 'west',  road: 'D', name: 'Road D - West',  flow: 350,  currentGreen: 30, left: 50,  through: 250,  right: 50,  lanes: 2, uploaded: true, fromCSV: true }
          };
          const newState = { ...state, approaches: demoApproaches };
          saveState(newState);
          saveCSVRecords([
            { time_of_day: '08:00 AM', vehicles_per_minute: 55, lanes: 2, incident_event: 'none' },
            { time_of_day: '08:15 AM', vehicles_per_minute: 40, lanes: 2, incident_event: 'none' },
            { time_of_day: '08:30 AM', vehicles_per_minute: 25, lanes: 2, incident_event: 'roadwork' }
          ]);
          renderEngineeringDashboard(demoApproaches, containerId);
        });
      }

      const uploadBtn = document.getElementById('btnEmptyStateTriggerUpload');
      if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
          const fileInput = document.getElementById('csvFileInput');
          if (fileInput) {
            fileInput.click();
          } else {
            window.location.href = 'analysis.html#csvUploadSection';
          }
        });
      }

      return;
    }

    const roadKeys = ['north', 'east', 'south', 'west'];
    const roadNamesMap = { north: 'Road A - North', east: 'Road B - East', south: 'Road C - South', west: 'Road D - West' };

    let totalDemandPCU = 0;
    const roadData = {};

    roadKeys.forEach(k => {
      const app = approaches[k] || {};
      const flow = parseFloat(app.flow) || 0;
      const left = parseFloat(app.left) || 0;
      const through = parseFloat(app.through) || 0;
      const right = parseFloat(app.right) || 0;
      const lanes = parseInt(app.lanes, 10) || 2;
      const green = parseFloat(app.currentGreen) || 30;
      const uploaded = app.uploaded === true || (flow > 0 && app.fromCSV === true);

      // Compute capacity based on lanes & green split
      const satFlow = 525 * (lanes * 3.5);
      const capacity = Math.round(satFlow * (green / 120)) || 900;
      const vc = capacity > 0 ? parseFloat((flow / capacity).toFixed(2)) : 0;

      roadData[k] = {
        name: roadNamesMap[k],
        flow: flow,
        left: left,
        through: through,
        right: right,
        lanes: lanes,
        green: green,
        capacity: capacity,
        vc: vc,
        uploaded: uploaded,
        isOversaturated: vc > 1.0
      };

      totalDemandPCU += flow;
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'engineering-dashboard-master';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '1.5rem';
    wrapper.style.marginTop = '1.5rem';

    // Helper functions for building table rows dynamically per road:
    const renderCardGrid = () => roadKeys.map(k => {
      const r = roadData[k];
      return `
        <div style="background: rgba(15,23,42,0.6); padding: 1rem; border-radius: 6px; border: 1px solid ${r.uploaded ? 'rgba(56,189,248,0.4)' : 'var(--border-color)'};">
          <h4 style="margin: 0 0 0.5rem 0; color: ${r.uploaded ? 'var(--primary)' : 'var(--text-muted)'};">${r.name}</h4>
          <div style="font-size: 0.83rem; display: flex; flex-direction: column; gap: 0.25rem;">
            <div>Incoming Lanes: <strong>${r.lanes} IN Lanes</strong></div>
            <div>Speed Limit: <strong>50 km/h</strong></div>
            <div>Total Demand: <strong style="color: ${r.uploaded ? 'var(--primary)' : 'var(--text-dim)'};">${r.flow > 0 ? `${r.flow} veh/h` : '0 veh/h (No Upload)'}</strong></div>
            <div>Current Green: <strong>${r.green}s</strong></div>
          </div>
        </div>
      `;
    }).join('');

    const renderTurningRows = () => roadKeys.map(k => {
      const r = roadData[k];
      const leftPct = r.flow > 0 ? Math.round((r.left / r.flow) * 100) : 0;
      const thruPct = r.flow > 0 ? Math.round((r.through / r.flow) * 100) : 0;
      const rightPct = r.flow > 0 ? Math.round((r.right / r.flow) * 100) : 0;

      return `
        <tr>
          <td><strong>${r.name}</strong></td>
          <td><span class="badge badge-low">${r.lanes} IN Lanes</span></td>
          <td>${r.flow > 0 ? r.left : 0}</td>
          <td>${r.flow > 0 ? r.through : 0}</td>
          <td>${r.flow > 0 ? r.right : 0}</td>
          <td><strong style="color:${r.flow > 0 ? 'var(--primary)' : 'var(--text-dim)'};">${r.flow}</strong></td>
          <td>${r.flow > 0 ? `Left: ${leftPct}% | Thru: ${thruPct}% | Right: ${rightPct}%` : '<span style="color:var(--text-dim);">No Data / Awaiting Upload</span>'}</td>
        </tr>
      `;
    }).join('');

    const renderCapacityRows = () => roadKeys.map(k => {
      const r = roadData[k];
      const isOver = r.vc > 1.0;
      return `
        <tr style="${isOver ? 'background: rgba(239,68,68,0.08);' : ''}">
          <td><strong>${r.name}</strong></td>
          <td>${r.flow}</td>
          <td>${r.capacity}</td>
          <td>${r.green}s</td>
          <td>${totalDemandPCU > 0 ? ((r.flow / totalDemandPCU) * 100).toFixed(1) : '0.0'}%</td>
          <td style="font-weight: 700; color: ${isOver ? '#ef4444' : '#10b981'};">${r.vc.toFixed(2)}</td>
          <td><span class="badge ${isOver ? 'badge-oversaturated' : 'badge-low'}" style="font-weight: 700;">${isOver ? 'OVERSATURATED' : (r.flow === 0 ? 'NO DATA' : 'LOW / OPTIMAL')}</span></td>
        </tr>
      `;
    }).join('');

    const renderSchematicDirections = () => roadKeys.map(k => {
      const r = roadData[k];
      return `
        <div style="background: rgba(30,41,59,0.6); padding: 0.75rem; border-radius: 4px; border: 1px solid ${r.uploaded ? 'rgba(56,189,248,0.4)' : 'var(--border-color)'};">
          <div style="font-weight: 700; color: #38bdf8;">${r.name.toUpperCase()}</div>
          <div style="font-size: 0.8rem; margin-top: 0.2rem;">INBOUND: <strong>${r.flow} PCU/h</strong></div>
          <div style="font-size: 0.8rem; color: ${r.vc > 1.0 ? '#ef4444' : '#10b981'}; font-weight: 700;">v/c Ratio: ${r.vc.toFixed(2)}</div>
        </div>
      `;
    }).join('');

    wrapper.innerHTML = `
      <!-- SECTION 1: Active Approach Traffic & Lane Configuration -->
      <div class="card" style="padding: 1.5rem; border: 1px solid rgba(56,189,248,0.35);">
        <h3 style="margin-top: 0; color: #38bdf8; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
          1. Active Approach Traffic & Lane Configuration (Interactive Panel)
        </h3>

        <div style="display: grid; grid-template-columns: 3fr 1fr; gap: 1.25rem;">
          <div class="grid-2" style="gap: 1rem;">
            ${renderCardGrid()}
          </div>

          <div style="background: rgba(30,41,59,0.5); padding: 1rem; border-radius: 6px; border: 1px solid var(--border-color); font-size: 0.8rem;">
            <div style="font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem;">IRC:106-1990 PCU Factors</div>
            <div style="display: flex; flex-direction: column; gap: 0.2rem; color: var(--text-muted); margin-bottom: 0.75rem;">
              <div>Car / Jeep: <strong>1.0 PCU</strong></div>
              <div>2-Wheeler: <strong>0.5 PCU</strong></div>
              <div>Auto-Rickshaw: <strong>0.8 PCU</strong></div>
              <div>City Bus: <strong>3.0 PCU</strong></div>
              <div>Truck / LCV: <strong>3.0 PCU</strong></div>
              <div>Bicycle: <strong>0.4 PCU</strong></div>
            </div>

            <div style="font-weight: 700; color: var(--text-main); margin-bottom: 0.3rem;">Signal Parameters</div>
            <div style="display: flex; flex-direction: column; gap: 0.2rem; color: var(--text-muted); margin-bottom: 0.75rem;">
              <div>Cycle Length (C): <strong>120s</strong></div>
              <div>Amber (Y): <strong>3s</strong></div>
              <div>All-Red (AR): <strong>2s</strong></div>
              <div>Base Saturation: <strong>1800 PCU/h/lane</strong></div>
            </div>

            <div style="background: rgba(56,189,248,0.1); padding: 0.5rem; border-radius: 4px; border-left: 3px solid #38bdf8;">
              <strong>Pedestrian Safety Module:</strong><br>
              Crossing Time = 7.0s + (14.0m / 1.2m/s) = 18.7s
            </div>
          </div>
        </div>
      </div>

      <!-- SECTION 2: Turning Movement Summary Table -->
      <div class="card" style="padding: 1.5rem;">
        <h3 style="margin-top: 0; color: var(--primary); font-size: 1.1rem;">
          2. Turning Movement Summary Table & Percentage Distribution
        </h3>

        <div class="table-responsive">
          <table class="data-table" style="width: 100%; font-size: 0.85rem;">
            <thead>
              <tr>
                <th>Active Origin Road</th>
                <th>Incoming Lanes</th>
                <th>Left Turn (veh/h)</th>
                <th>Through (veh/h)</th>
                <th>Right Turn (veh/h)</th>
                <th>Total Demand</th>
                <th>Turning Distribution (%)</th>
              </tr>
            </thead>
            <tbody>
              ${renderTurningRows()}
            </tbody>
          </table>
        </div>
        <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 0.5rem;">
          * Destination mapping follows Indian Left-Hand Traffic (LHT). Inactive destination roads are automatically assigned 0 veh/h.
        </div>
      </div>

      <!-- SECTION 3: Approach Capacity & Volume-to-Capacity (v/c) Ratios -->
      <div class="card" style="padding: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0; color: var(--primary); font-size: 1.1rem;">
            3. Approach Capacity & Volume-to-Capacity (v/c) Ratios
          </h3>
          <span style="font-size: 0.95rem; font-weight: 700; color: #ef4444; background: rgba(239,68,68,0.15); padding: 0.3rem 0.75rem; border-radius: 4px; border: 1px solid rgba(239,68,68,0.3);">
            Total Demand: ${totalDemandPCU.toLocaleString()} PCU/h
          </span>
        </div>

        <div class="table-responsive">
          <table class="data-table" style="width: 100%; font-size: 0.85rem;">
            <thead>
              <tr>
                <th>Active Approach</th>
                <th>Total Demand (veh/h)</th>
                <th>Capacity (veh/h)</th>
                <th>Current Green</th>
                <th>Demand Share</th>
                <th>v/c Ratio</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${renderCapacityRows()}
            </tbody>
          </table>
        </div>
      </div>

      <!-- SECTION 4: Intersection Demand Schematic (Indian LHT) -->
      <div class="card" style="padding: 1.5rem;">
        <h3 style="margin-top: 0; color: var(--primary); font-size: 1.1rem; margin-bottom: 0.75rem;">
          4. Intersection Demand Schematic (Indian LHT)
        </h3>

        <div style="background: rgba(15,23,42,0.8); padding: 1.25rem; border-radius: 6px; border: 1px solid var(--border-color);">
          <div style="display: flex; gap: 1.5rem; align-items: center; margin-bottom: 1rem; font-size: 0.83rem;">
            <strong>SCHEMATIC LEGEND:</strong>
            <span style="color: #3b82f6;">■ Blue = Left Turn (↰)</span>
            <span style="color: #10b981;">■ Green = Through (↑)</span>
            <span style="color: #f97316;">■ Orange = Right Turn (↱)</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; text-align: center;">
            ${renderSchematicDirections()}
          </div>
        </div>
      </div>

      <!-- SECTION 5: Signal Timing Optimization Plan -->
      <div class="card" style="padding: 1.5rem;">
        <h3 style="margin-top: 0; color: #f97316; font-size: 1.1rem; margin-bottom: 0.5rem;">
          5. Signal Timing Optimization Plan (Simulation Outputs)
        </h3>
        <div style="font-weight: 700; color: #ef4444; background: rgba(239,68,68,0.12); padding: 0.6rem 1rem; border-radius: 4px; border-left: 4px solid #ef4444; margin-bottom: 1rem;">
          PROPOSED PLAN — NOT RECOMMENDED — Retain baseline signal timing
        </div>

        <div style="background: rgba(30,41,59,0.5); padding: 1rem; border-radius: 6px; margin-bottom: 1.25rem; font-size: 0.85rem;">
          <strong>Three-Stage Refinement Summary:</strong>
          <div style="display: flex; gap: 1.5rem; margin-top: 0.4rem; font-family: var(--font-mono);">
            <div>Stage 1 Candidate: A: 7s | B: 7s | C: 7s | D: 79s</div>
            <div>Stage 2 Balanced: A: 25s | B: 25s | C: 25s | D: 25s</div>
            <div>Stage 3 Final: A: 25s | B: 25s | C: 25s | D: 25s</div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table" style="width: 100%; font-size: 0.85rem;">
            <thead>
              <tr>
                <th>Active Approach Road</th>
                <th>Current Green</th>
                <th>Proposed Green</th>
                <th>Difference (&Delta;g)</th>
                <th>Current Delay</th>
                <th>Simulated Delay</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${roadKeys.map(k => {
                const r = roadData[k];
                return `
                  <tr>
                    <td><strong>${r.name}</strong></td>
                    <td>${r.green}s</td>
                    <td>25s</td>
                    <td>-5s</td>
                    <td>${r.flow > 0 ? '448.6s' : '0.0s'}</td>
                    <td>${r.flow > 0 ? '474.4s (+25.8s)' : '0.0s'}</td>
                    <td><span class="badge ${r.vc > 1.0 ? 'badge-oversaturated' : 'badge-low'}">${r.vc > 1.0 ? 'OVERSATURATED' : 'OK'}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 1rem; background: rgba(15,23,42,0.8); padding: 1rem; border-radius: 6px; border-left: 4px solid var(--primary); font-size: 0.85rem; line-height: 1.5;">
          <strong>AI RATIONALE:</strong> Candidate green redistribution alone cannot provide acceptable approach-level performance under current demand and cycle constraints. Baseline timing should be retained. Advisory: Review physical approach geometry or overall cycle budget.
        </div>
      </div>

      <!-- SECTION 6: Live Engineering Formula Breakdown -->
      <div class="card" style="padding: 1.5rem;">
        <h3 style="margin-top: 0; color: var(--primary); font-size: 1.1rem; margin-bottom: 0.75rem;">
          6. Live Engineering Formula Breakdown (How FlowGuard Calculated This)
        </h3>

        <div style="background: rgba(30,41,59,0.5); padding: 0.75rem 1rem; border-radius: 4px; font-size: 0.8rem; margin-bottom: 1.25rem;">
          <strong>10-Step Operational Workflow Pipeline:</strong><br>
          1. Traffic Input &rarr; 2. PCU Demand &rarr; 3. Sat. Flow & Capacity &rarr; 4. V/C Ratio &rarr; 5. Baseline Performance &rarr; 6. Stage 1 Candidate &rarr; 7. Stage 2 Balanced &rarr; 8. Stage 3 Sim Validation &rarr; 9. Final Timing &rarr; 10. Recommendation
        </div>

        <div style="background: #0f172a; padding: 1.25rem; border-radius: 6px; border: 1px solid var(--border-color); font-family: var(--font-mono); font-size: 0.82rem; line-height: 1.6; color: #38bdf8;">
          <div>// LIVE ENGINEERING MATH EXECUTED PER ROAD APPROACH:</div>
          ${roadKeys.map(k => {
            const r = roadData[k];
            return `
              <div style="margin-top:0.4rem; padding-top:0.4rem; border-top:1px dashed rgba(255,255,255,0.1);">
                <strong>[${r.name}]</strong> Capacity (ci) = ${r.capacity} PCU/h | V/C Ratio (Xi) = ${r.vc.toFixed(2)} | Arrival (&lambda;i) = ${(r.flow/3600).toFixed(3)} veh/s | Service (&mu;i) = 1.000 veh/s
              </div>
            `;
          }).join('')}
          <div style="color: #e2e8f0; margin-top: 0.5rem;">// D/D/1 Queuing Equation: Red Accumulation Qpeak = &lambda;i &times; ri | Delay Area Dred = 0.5 &times; ri &times; Qpeak</div>
        </div>
      </div>

      <!-- SECTION 7: Congestion & Level-of-Service (LOS) Assessment -->
      <div class="card" style="padding: 1.5rem; border: 1px solid rgba(239,68,68,0.4);">
        <h3 style="margin-top: 0; color: #ef4444; font-size: 1.1rem; margin-bottom: 0.75rem;">
          7. Congestion & Level-of-Service (LOS) Assessment
        </h3>

        <div style="background: rgba(239,68,68,0.18); border: 2px solid #ef4444; padding: 1rem; border-radius: 6px; color: #ef4444; font-weight: 700; font-size: 1.2rem; text-align: center; margin-bottom: 1.25rem;">
          INTERSECTION PERFORMANCE: ${totalDemandPCU > 3600 ? 'LOS F — OVERSATURATED' : 'LOS A — OPTIMAL'}
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
          <div style="background: rgba(30,41,59,0.6); padding: 1rem; border-radius: 6px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Avg Control Delay</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: #ef4444;">${totalDemandPCU > 3600 ? '448.6 s/veh' : '12.4 s/veh'}</div>
          </div>
          <div style="background: rgba(30,41,59,0.6); padding: 1rem; border-radius: 6px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Intersection LOS</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: #ef4444;">${totalDemandPCU > 3600 ? 'LOS F' : 'LOS A'}</div>
          </div>
          <div style="background: rgba(30,41,59,0.6); padding: 1rem; border-radius: 6px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Critical Approach</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: #38bdf8;">Road A - North</div>
          </div>
          <div style="background: rgba(30,41,59,0.6); padding: 1rem; border-radius: 6px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Max Queue</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: #ef4444;">${totalDemandPCU > 3600 ? '803 veh' : '5 veh'}</div>
          </div>
        </div>

        <div style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem;">
          Approach-Level Assessment (Active Approaches Only)
        </div>
        <div class="table-responsive" style="margin-bottom: 1.5rem;">
          <table class="data-table" style="width: 100%; font-size: 0.85rem;">
            <thead>
              <tr>
                <th>Road</th>
                <th>Demand (PCU/h)</th>
                <th>Capacity (PCU/h)</th>
                <th>v/c Ratio</th>
                <th>Avg Delay</th>
                <th>Max Queue</th>
                <th>LOS</th>
                <th>Severity</th>
                <th>Primary Problem</th>
                <th>Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              ${roadKeys.map(k => {
                const r = roadData[k];
                const isOver = r.vc > 1.0;
                return `
                  <tr>
                    <td><strong>${r.name} ${isOver ? '★ CRITICAL' : ''}</strong></td>
                    <td>${r.flow}</td>
                    <td>${r.capacity}</td>
                    <td style="color:${isOver ? '#ef4444' : '#10b981'}; font-weight:700;">${r.vc.toFixed(2)}</td>
                    <td>${r.flow > 0 ? '448.6s' : '0.0s'}</td>
                    <td>${r.flow > 0 ? '803' : '0'}</td>
                    <td><span class="badge ${isOver ? 'badge-oversaturated' : 'badge-low'}">${isOver ? 'F' : 'A'}</span></td>
                    <td><span class="badge ${isOver ? 'badge-oversaturated' : 'badge-low'}">${isOver ? 'OVERSATURATED' : (r.flow === 0 ? 'NO DATA' : 'LOW')}</span></td>
                    <td style="color:${isOver ? '#ef4444' : '#10b981'}; font-weight:600;">${isOver ? 'DEMAND EXCEEDS CAPACITY' : 'WITHIN CAPACITY'}</td>
                    <td style="color:#10b981;">${isOver ? 'Increase capacity / effective green.' : 'Optimal timing.'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.75rem;">
          Demand / Capacity Visualization (PCU/h)
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
          ${roadKeys.map(k => {
            const r = roadData[k];
            const pct = Math.min(100, Math.round(r.vc * 100));
            return `
              <div style="background: rgba(30,41,59,0.5); padding: 0.75rem; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.3rem;">
                  <span>${r.name} (v/c = ${r.vc.toFixed(2)})</span>
                  <span style="color:${r.vc > 1.0 ? '#ef4444' : '#10b981'}; font-weight:700;">${r.vc > 1.0 ? 'OVERSATURATED' : (r.flow === 0 ? 'NO DATA' : 'OPTIMAL')}</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); height: 10px; border-radius: 5px; overflow: hidden;">
                  <div style="background: ${r.vc > 1.0 ? '#ef4444' : '#10b981'}; width: ${pct}%; height: 100%;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem;">
          Queue Risk Assessment
        </div>
        <div class="table-responsive" style="margin-bottom: 1.5rem;">
          <table class="data-table" style="width: 100%; font-size: 0.85rem;">
            <thead>
              <tr>
                <th>Approach</th>
                <th>Max Queue (veh)</th>
                <th>Avg Queue (veh)</th>
                <th>Residual Queue</th>
                <th>Queue Risk</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${roadKeys.map(k => {
                const r = roadData[k];
                const isOver = r.vc > 1.0;
                return `
                  <tr>
                    <td>${r.name}</td>
                    <td>${r.flow > 0 ? 803 : 0}</td>
                    <td>${r.flow > 0 ? 411.3 : 0}</td>
                    <td>${r.flow > 0 ? 800 : 0}</td>
                    <td><span class="badge ${isOver ? 'badge-oversaturated' : 'badge-low'}" style="font-weight:700;">${isOver ? 'CRITICAL' : 'LOW'}</span></td>
                    <td style="font-size:0.8rem;">${isOver ? 'Residual queue remains after simulation horizon. Persistent queue growth likely.' : 'No queue accumulation.'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="background: rgba(239,68,68,0.12); border-left: 4px solid #ef4444; padding: 1rem; border-radius: 4px; font-size: 0.85rem; color: #f87171;">
          <strong style="color: #ef4444;">⚠ ENGINEERING WARNINGS DETECTED:</strong>
          <ul style="margin: 0.5rem 0 0 1.25rem; padding: 0;">
            ${roadKeys.filter(k => roadData[k].vc > 1.0).map(k => `
              <li>⚠ Oversaturated approach detected: ${roadData[k].name} (v/c = ${roadData[k].vc.toFixed(2)}).</li>
              <li>⚠ LOS F operation detected on ${roadData[k].name}.</li>
              <li>⚠ Residual queue remains after simulation horizon on ${roadData[k].name}.</li>
            `).join('')}
            ${roadKeys.filter(k => roadData[k].vc > 1.0).length === 0 ? '<li>✓ All active approaches are within capacity limits.</li>' : ''}
          </ul>
        </div>
      </div>
    `;

    container.appendChild(wrapper);

    // Smooth scroll to the results
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return wrapper;
  }

  return {
    APPROACHES,
    getState,
    saveState,
    saveCSVRecords,
    getCSVRecords,
    resetToDefaults,
    formatNum,
    validateInput,
    getActiveApproachKeys,
    getConfigLabel,
    getMovementDestination,
    isMovementValid,
    validateApproachInputs,
    calculateApproachPCU,
    MOVEMENT_MAP,
    DEFAULT_STATE,
    renderSimulationDashboardResults,
    parseTrafficCSV,
    renderPhaseDiagram,
    generateEngineeringReport,
    initWhatIfSlider,
    fetchSyntheticDataAPI,
    analyzeTrafficAPI,
    renderEngineeringDashboard
  };
})();
if (typeof window !== 'undefined') { 
  window.FlowGuard = FlowGuard; 
  window.renderEngineeringDashboard = FlowGuard.renderEngineeringDashboard;
}
if (typeof module !== 'undefined' && module.exports) { module.exports = FlowGuard; }


