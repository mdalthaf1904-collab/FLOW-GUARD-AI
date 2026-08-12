/**
 * FlowGuard AI - 2D Top-Down Microscopic Canvas Traffic Simulation Engine
 * CSV-Data-Driven Microscopic Car-Following & Turning Movement Animation Engine
 * Synchronized with Webster Optimum Signal Timings & IRC:93 Clearance Bounds
 */

(function(global) {
  'use strict';

  let canvas = null;
  let ctx = null;
  let animationFrameId = null;
  let isRunning = false;
  let isPaused = false;
  let simSpeed = 1.0;
  let timeElapsed = 0; // seconds
  let lastTimestamp = 0;

  // Active CSV Interval & Traffic Data
  let activeInterval = null; // e.g. "08:30 - 08:45"
  let csvRecords = [];
  let approachDemands = {
    north: { flow: 850, car: 425, bike: 200, bus: 50, truck: 25, left: 120, through: 610, right: 120, totalVeh: 700 },
    east:  { flow: 720, car: 360, bike: 180, bus: 40, truck: 20, left: 100, through: 520, right: 100, totalVeh: 600 },
    south: { flow: 280, car: 140, bike: 80,  bus: 20, truck: 10, left: 40,  through: 200, right: 40,  totalVeh: 250 },
    west:  { flow: 350, car: 175, bike: 90,  bus: 25, truck: 10, left: 50,  through: 250, right: 50,  totalVeh: 300 }
  };

  // Signal State Controller (Phase order: North/South -> East/West or Phase 1-4)
  let activePhaseIndex = 0; // 0: North/South Green, 1: N/S Yellow, 2: East/West Green, 3: E/W Yellow
  let phaseTimer = 0; // seconds remaining in current phase
  let phaseDurations = {
    nsGreen: 40,
    nsYellow: 4,
    ewGreen: 35,
    ewYellow: 4
  };

  // Signal state per approach: 'RED', 'YELLOW', 'GREEN'
  let signalStates = {
    north: 'RED',
    south: 'RED',
    east:  'RED',
    west:  'RED'
  };

  // Signal countdown numbers displayed on canvas badges
  let signalCountdowns = {
    north: 40,
    south: 40,
    east:  44,
    west:  44
  };

  // Active Vehicles Array
  let vehicles = [];
  let nextVehicleId = 1;
  let spawnAccumulators = { north: 0, east: 0, south: 0, west: 0 };

  // EVP Emergency Vehicle Priority State
  let evpActive = false;
  let evpApproach = null;
  let evpTimer = 0;

  // Vehicle Types & Specs
  const VEHICLE_TYPES = {
    CAR:   { name: 'Car',   length: 22, width: 11, speed: 2.2, accel: 0.08, decel: 0.15, color: '#38bdf8', pcu: 1.0 },
    BIKE:  { name: 'Bike',  length: 12, width: 6,  speed: 2.6, accel: 0.12, decel: 0.20, color: '#a78bfa', pcu: 0.5 },
    BUS:   { name: 'Bus',   length: 36, width: 14, speed: 1.6, accel: 0.05, decel: 0.10, color: '#f59e0b', pcu: 2.5 },
    TRUCK: { name: 'Truck', length: 38, width: 14, speed: 1.4, accel: 0.04, decel: 0.09, color: '#ef4444', pcu: 3.0 },
    AMBULANCE: { name: 'Ambulance', length: 26, width: 12, speed: 3.0, accel: 0.15, decel: 0.25, color: '#ffffff', pcu: 1.0 }
  };

  // Canvas Viewport Coordinates (Center 450, 325)
  const CENTER_X = 450;
  const CENTER_Y = 325;
  const ROAD_WIDTH = 120; // 60px inbound, 60px outbound (2 lanes each way)
  const STOP_OFFSET = 85; // Distance from center to stop line

  // Approach Stop Lines & Spawn Points
  const APPROACH_CONFIGS = {
    north: {
      spawnX: CENTER_X - 30, spawnY: -40,
      stopX: CENTER_X - 30,  stopY: CENTER_Y - STOP_OFFSET,
      dirX: 0, dirY: 1, angle: Math.PI / 2
    },
    south: {
      spawnX: CENTER_X + 30, spawnY: 690,
      stopX: CENTER_X + 30,  stopY: CENTER_Y + STOP_OFFSET,
      dirX: 0, dirY: -1, angle: -Math.PI / 2
    },
    east: {
      spawnX: 940, spawnY: CENTER_Y - 30,
      stopX: CENTER_X + STOP_OFFSET, stopY: CENTER_Y - 30,
      dirX: -1, dirY: 0, angle: Math.PI
    },
    west: {
      spawnX: -40, spawnY: CENTER_Y + 30,
      stopX: CENTER_X - STOP_OFFSET, stopY: CENTER_Y + 30,
      dirX: 1, dirY: 0, angle: 0
    }
  };

  /**
   * Vehicle Class
   */
  class Vehicle {
    constructor(id, typeKey, approachKey, movement = 'THROUGH') {
      this.id = id;
      this.typeKey = typeKey;
      this.spec = VEHICLE_TYPES[typeKey] || VEHICLE_TYPES.CAR;
      this.approach = approachKey;
      this.movement = movement; // 'LEFT', 'THROUGH', 'RIGHT'

      const cfg = APPROACH_CONFIGS[approachKey];
      this.x = cfg.spawnX;
      this.y = cfg.spawnY;
      this.vx = cfg.dirX * this.spec.speed;
      this.vy = cfg.dirY * this.spec.speed;
      this.currentSpeed = this.spec.speed;
      this.angle = cfg.angle;

      this.isStopped = false;
      this.passedStopLine = false;
      this.hasClearedJunction = false;
      this.progressInTurn = 0; // 0 to 1 for turning curve
    }

    update(delta, allVehicles) {
      const cfg = APPROACH_CONFIGS[this.approach];
      const sigState = signalStates[this.approach];

      // Check distance to stop line
      let distToStop = 999;
      if (!this.passedStopLine) {
        if (this.approach === 'north') distToStop = cfg.stopY - this.y;
        else if (this.approach === 'south') distToStop = this.y - cfg.stopY;
        else if (this.approach === 'east') distToStop = this.x - cfg.stopX;
        else if (this.approach === 'west') distToStop = cfg.stopX - this.x;

        if (distToStop < -10) {
          this.passedStopLine = true;
        }
      }

      // Check distance to vehicle ahead in same approach lane
      let distToLead = 999;
      allVehicles.forEach(other => {
        if (other.id !== this.id && other.approach === this.approach && !other.passedStopLine) {
          let gap = 999;
          if (this.approach === 'north' && other.y > this.y) gap = other.y - this.y - other.spec.length;
          else if (this.approach === 'south' && other.y < this.y) gap = this.y - other.y - other.spec.length;
          else if (this.approach === 'east' && other.x < this.x) gap = this.x - other.x - other.spec.length;
          else if (this.approach === 'west' && other.x > this.x) gap = other.x - this.x - other.spec.length;

          if (gap > 0 && gap < distToLead) distToLead = gap;
        }
      });

      // Target Speed determination
      let targetSpeed = this.spec.speed;

      // Red or Yellow light deceleration if before stop line
      if (!this.passedStopLine && (sigState === 'RED' || (sigState === 'YELLOW' && distToStop > 25))) {
        if (distToStop < 90) {
          targetSpeed = Math.max(0, (distToStop / 90) * this.spec.speed);
        }
      }

      // Decelerate for vehicle ahead
      if (distToLead < 45) {
        targetSpeed = Math.min(targetSpeed, Math.max(0, (distToLead / 45) * this.spec.speed));
      }

      // Speed transition (accel / decel)
      if (this.currentSpeed < targetSpeed) {
        this.currentSpeed = Math.min(targetSpeed, this.currentSpeed + this.spec.accel * delta);
      } else if (this.currentSpeed > targetSpeed) {
        this.currentSpeed = Math.max(targetSpeed, this.currentSpeed - this.spec.decel * delta);
      }

      // Movement execution
      if (!this.passedStopLine || this.movement === 'THROUGH') {
        this.x += cfg.dirX * this.currentSpeed * delta * simSpeed;
        this.y += cfg.dirY * this.currentSpeed * delta * simSpeed;
      } else {
        // Turning Bézier Curve progression inside junction box
        this.progressInTurn = Math.min(1, this.progressInTurn + (this.currentSpeed * 0.012 * delta * simSpeed));
        const curve = getTurningCurve(this.approach, this.movement);
        const pt = getBezierPoint(curve.p0, curve.p1, curve.p2, this.progressInTurn);
        this.x = pt.x;
        this.y = pt.y;
        this.angle = pt.angle;

        if (this.progressInTurn >= 1) {
          this.hasClearedJunction = true;
        }
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Vehicle Body Rect
      ctx.fillStyle = this.spec.color;
      if (this.typeKey === 'AMBULANCE') {
        // Flash siren
        const flash = Math.floor(Date.now() / 150) % 2 === 0;
        ctx.fillStyle = flash ? '#ef4444' : '#38bdf8';
      }

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-this.spec.length / 2, -this.spec.width / 2, this.spec.length, this.spec.width, 3);
      } else {
        ctx.rect(-this.spec.length / 2, -this.spec.width / 2, this.spec.length, this.spec.width);
      }
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Windshield detail
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(this.spec.length * 0.1, -this.spec.width * 0.35, this.spec.length * 0.25, this.spec.width * 0.7);

      // Headlights
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(this.spec.length / 2 - 2, -this.spec.width * 0.4, 2, 2);
      ctx.fillRect(this.spec.length / 2 - 2, this.spec.width * 0.4 - 2, 2, 2);

      ctx.restore();
    }
  }

  /**
   * Bézier Curve Helper for Turning Movements
   */
  function getTurningCurve(approach, movement) {
    const r = STOP_OFFSET;
    if (approach === 'north' && movement === 'LEFT') {
      return { p0: { x: CENTER_X - 30, y: CENTER_Y - r }, p1: { x: CENTER_X - 30, y: CENTER_Y - 15 }, p2: { x: CENTER_X + r, y: CENTER_Y - 30 } };
    }
    if (approach === 'north' && movement === 'RIGHT') {
      return { p0: { x: CENTER_X - 30, y: CENTER_Y - r }, p1: { x: CENTER_X - 30, y: CENTER_Y - 15 }, p2: { x: CENTER_X - r, y: CENTER_Y + 30 } };
    }
    if (approach === 'east' && movement === 'LEFT') {
      return { p0: { x: CENTER_X + r, y: CENTER_Y - 30 }, p1: { x: CENTER_X + 15, y: CENTER_Y - 30 }, p2: { x: CENTER_X + 30, y: CENTER_Y + r } };
    }
    if (approach === 'east' && movement === 'RIGHT') {
      return { p0: { x: CENTER_X + r, y: CENTER_Y - 30 }, p1: { x: CENTER_X + 15, y: CENTER_Y - 30 }, p2: { x: CENTER_X - 30, y: CENTER_Y - r } };
    }
    if (approach === 'south' && movement === 'LEFT') {
      return { p0: { x: CENTER_X + 30, y: CENTER_Y + r }, p1: { x: CENTER_X + 30, y: CENTER_Y + 15 }, p2: { x: CENTER_X - r, y: CENTER_Y + 30 } };
    }
    if (approach === 'south' && movement === 'RIGHT') {
      return { p0: { x: CENTER_X + 30, y: CENTER_Y + r }, p1: { x: CENTER_X + 30, y: CENTER_Y + 15 }, p2: { x: CENTER_X + r, y: CENTER_Y - 30 } };
    }
    if (approach === 'west' && movement === 'LEFT') {
      return { p0: { x: CENTER_X - r, y: CENTER_Y + 30 }, p1: { x: CENTER_X - 15, y: CENTER_Y + 30 }, p2: { x: CENTER_X - 30, y: CENTER_Y - r } };
    }
    if (approach === 'west' && movement === 'RIGHT') {
      return { p0: { x: CENTER_X - r, y: CENTER_Y + 30 }, p1: { x: CENTER_X - 15, y: CENTER_Y + 30 }, p2: { x: CENTER_X + 30, y: CENTER_Y + r } };
    }
    return { p0: { x: CENTER_X, y: CENTER_Y }, p1: { x: CENTER_X, y: CENTER_Y }, p2: { x: CENTER_X, y: CENTER_Y } };
  }

  function getBezierPoint(p0, p1, p2, t) {
    const invT = 1 - t;
    const x = invT * invT * p0.x + 2 * invT * t * p1.x + t * t * p2.x;
    const y = invT * invT * p0.y + 2 * invT * t * p1.y + t * t * p2.y;

    const dx = 2 * invT * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const dy = 2 * invT * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    const angle = Math.atan2(dy, dx);

    return { x, y, angle };
  }

  /**
   * Ingest CSV Dataset Records & Interval Data
   */
  function loadCSVDatasetData() {
    if (typeof global.FlowGuard !== 'undefined' && typeof global.FlowGuard.getCSVRecords === 'function') {
      csvRecords = global.FlowGuard.getCSVRecords() || [];
    }

    if (!csvRecords || csvRecords.length === 0) {
      console.log('[FlowGuard 2D Sim] Using fallback approach demands.');
      return;
    }

    // Populate Interval Dropdown if present
    const intervalSelect = typeof document !== 'undefined' ? document.getElementById('simCsvIntervalSelect') : null;
    if (intervalSelect && csvRecords.length > 0) {
      const intervals = [...new Set(csvRecords.map(r => r.Time || r.time || r.Interval).filter(Boolean))];
      intervalSelect.innerHTML = '';
      intervals.forEach((timeStr, idx) => {
        const opt = document.createElement('option');
        opt.value = timeStr;
        opt.textContent = `⏱️ ${timeStr}${idx === 0 ? ' (Peak Interval)' : ''}`;
        intervalSelect.appendChild(opt);
      });

      if (!activeInterval && intervals.length > 0) {
        activeInterval = intervals[0];
      }
    }

    // Extract demands for activeInterval
    applyIntervalDemands(activeInterval);
  }

  function applyIntervalDemands(timeStr) {
    if (!csvRecords || csvRecords.length === 0) return;
    activeInterval = timeStr;

    const filtered = csvRecords.filter(r => (r.Time || r.time || r.Interval) === timeStr);
    if (filtered.length === 0) return;

    ['north', 'east', 'south', 'west'].forEach(appKey => {
      const match = filtered.find(r => {
        const road = (r.Road || r.road || r.Approach || '').toLowerCase();
        if (appKey === 'north') return road.includes('north') || road.includes('road a') || road.includes('arm a');
        if (appKey === 'east') return road.includes('east') || road.includes('road b') || road.includes('arm b');
        if (appKey === 'south') return road.includes('south') || road.includes('road c') || road.includes('arm c');
        if (appKey === 'west') return road.includes('west') || road.includes('road d') || road.includes('arm d');
        return false;
      });

      if (match) {
        const car   = parseInt(match.Cars || match.cars || match.Car, 10) || 0;
        const bike  = parseInt(match.Bikes || match.bikes || match.TwoWheeler, 10) || 0;
        const bus   = parseInt(match.Bus || match.bus, 10) || 0;
        const truck = parseInt(match.Truck || match.truck || match.HCV, 10) || 0;
        const left  = parseInt(match.Left || match.left, 10) || Math.round(car * 0.2);
        const thr   = parseInt(match.Through || match.through, 10) || Math.round(car * 0.6);
        const rgt   = parseInt(match.Right || match.right, 10) || Math.round(car * 0.2);

        const totalVeh = car + bike + bus + truck;
        const pcu = (car * 1.0) + (bike * 0.5) + (bus * 2.5) + (truck * 3.0);

        approachDemands[appKey] = {
          flow: pcu > 0 ? pcu * 4 : 400, // hourly PCU/h rate
          car, bike, bus, truck, totalVeh, left, through: thr, right: rgt
        };
      }
    });

    console.log(`[FlowGuard 2D Sim] Applied CSV Interval '${timeStr}' Demands:`, approachDemands);
    calculateSignalPhaseTimings();
  }

  /**
   * Recalculate Webster Signal Timings for 2D Simulation
   */
  function calculateSignalPhaseTimings() {
    const appN = approachDemands.north.flow;
    const appS = approachDemands.south.flow;
    const appE = approachDemands.east.flow;
    const appW = approachDemands.west.flow;

    const satPerLane = 1800; // pcu/h
    const yNS = Math.max(appN, appS) / (satPerLane * 2);
    const yEW = Math.max(appE, appW) / (satPerLane * 2);
    const Y = Math.min(0.85, yNS + yEW);

    const L = 10; // lost time sec
    let C = Math.round((1.5 * L + 5) / (1 - Y));
    C = Math.max(40, Math.min(120, C));

    const totalGreen = C - L;
    const gNS = Math.max(12, Math.round((yNS / Y) * totalGreen));
    const gEW = Math.max(12, totalGreen - gNS);

    phaseDurations.nsGreen = gNS;
    phaseDurations.nsYellow = 4;
    phaseDurations.ewGreen = gEW;
    phaseDurations.ewYellow = 4;

    console.log(`[FlowGuard 2D Sim] Webster Timings calculated — C: ${C}s | N/S Green: ${gNS}s | E/W Green: ${gEW}s`);
  }

  /**
   * Spawn Vehicle Logic based on CSV Demand Rates
   */
  function spawnVehicles(deltaSeconds) {
    ['north', 'east', 'south', 'west'].forEach(appKey => {
      const demand = approachDemands[appKey];
      const vehPerSec = (demand.totalVeh && demand.totalVeh > 0 ? demand.totalVeh / 900 : demand.flow / 3600);
      spawnAccumulators[appKey] += vehPerSec * deltaSeconds * simSpeed;

      if (spawnAccumulators[appKey] >= 1.0) {
        spawnAccumulators[appKey] -= 1.0;

        const randType = Math.random();
        let typeKey = 'CAR';
        if (randType < 0.50) typeKey = 'CAR';
        else if (randType < 0.75) typeKey = 'BIKE';
        else if (randType < 0.90) typeKey = 'BUS';
        else typeKey = 'TRUCK';

        const randMove = Math.random();
        let movement = 'THROUGH';
        if (randMove < 0.20) movement = 'LEFT';
        else if (randMove < 0.80) movement = 'THROUGH';
        else movement = 'RIGHT';

        const veh = new Vehicle(nextVehicleId++, typeKey, appKey, movement);
        vehicles.push(veh);
      }
    });
  }

  /**
   * Trigger Emergency Vehicle Priority (EVP)
   */
  function triggerEVP(approachKey = 'north') {
    evpActive = true;
    evpApproach = approachKey;
    evpTimer = 15;

    ['north', 'east', 'south', 'west'].forEach(k => {
      signalStates[k] = (k === approachKey) ? 'GREEN' : 'RED';
      signalCountdowns[k] = (k === approachKey) ? 15 : 15;
    });

    const ambulance = new Vehicle(nextVehicleId++, 'AMBULANCE', approachKey, 'THROUGH');
    vehicles.unshift(ambulance);

    console.log(`[FlowGuard 2D Sim] ⚡ EVP TRIGGERED on ${approachKey.toUpperCase()} approach!`);
  }

  /**
   * Update Simulation Physics & Signal Timer
   */
  function updateSimulation(deltaSeconds) {
    timeElapsed += deltaSeconds * simSpeed;

    if (evpActive) {
      evpTimer -= deltaSeconds * simSpeed;
      if (evpTimer <= 0) {
        evpActive = false;
        evpApproach = null;
        activePhaseIndex = 0;
        phaseTimer = phaseDurations.nsGreen;
        console.log('[FlowGuard 2D Sim] EVP complete. Resuming normal Webster cycle.');
      }
    } else {
      phaseTimer -= deltaSeconds * simSpeed;
      if (phaseTimer <= 0) {
        activePhaseIndex = (activePhaseIndex + 1) % 4;
        if (activePhaseIndex === 0) phaseTimer = phaseDurations.nsGreen;
        else if (activePhaseIndex === 1) phaseTimer = phaseDurations.nsYellow;
        else if (activePhaseIndex === 2) phaseTimer = phaseDurations.ewGreen;
        else if (activePhaseIndex === 3) phaseTimer = phaseDurations.ewYellow;
      }

      if (activePhaseIndex === 0) {
        signalStates.north = 'GREEN'; signalStates.south = 'GREEN';
        signalStates.east = 'RED'; signalStates.west = 'RED';
        signalCountdowns.north = Math.ceil(phaseTimer); signalCountdowns.south = Math.ceil(phaseTimer);
        signalCountdowns.east = Math.ceil(phaseTimer + phaseDurations.nsYellow + phaseDurations.ewGreen);
        signalCountdowns.west = signalCountdowns.east;
      } else if (activePhaseIndex === 1) {
        signalStates.north = 'YELLOW'; signalStates.south = 'YELLOW';
        signalStates.east = 'RED'; signalStates.west = 'RED';
        signalCountdowns.north = Math.ceil(phaseTimer); signalCountdowns.south = Math.ceil(phaseTimer);
        signalCountdowns.east = Math.ceil(phaseTimer + phaseDurations.ewGreen);
        signalCountdowns.west = signalCountdowns.east;
      } else if (activePhaseIndex === 2) {
        signalStates.north = 'RED'; signalStates.south = 'RED';
        signalStates.east = 'GREEN'; signalStates.west = 'GREEN';
        signalCountdowns.east = Math.ceil(phaseTimer); signalCountdowns.west = Math.ceil(phaseTimer);
        signalCountdowns.north = Math.ceil(phaseTimer + phaseDurations.ewYellow + phaseDurations.nsGreen);
        signalCountdowns.south = signalCountdowns.north;
      } else if (activePhaseIndex === 3) {
        signalStates.north = 'RED'; signalStates.south = 'RED';
        signalStates.east = 'YELLOW'; signalStates.west = 'YELLOW';
        signalCountdowns.east = Math.ceil(phaseTimer); signalCountdowns.west = Math.ceil(phaseTimer);
        signalCountdowns.north = Math.ceil(phaseTimer + phaseDurations.nsGreen);
        signalCountdowns.south = signalCountdowns.north;
      }
    }

    spawnVehicles(deltaSeconds);

    for (let i = vehicles.length - 1; i >= 0; i--) {
      const v = vehicles[i];
      v.update(deltaSeconds, vehicles);

      if (v.x < -60 || v.x > 960 || v.y < -60 || v.y > 710 || v.hasClearedJunction) {
        vehicles.splice(i, 1);
      }
    }
  }

  /**
   * Main Render Loop (Draw Scene)
   */
  function renderScene() {
    if (!ctx) return;

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#064e3b';
    ctx.fillRect(0, 0, CENTER_X - ROAD_WIDTH / 2, CENTER_Y - ROAD_WIDTH / 2);
    ctx.fillRect(CENTER_X + ROAD_WIDTH / 2, 0, CENTER_X - ROAD_WIDTH / 2, CENTER_Y - ROAD_WIDTH / 2);
    ctx.fillRect(0, CENTER_Y + ROAD_WIDTH / 2, CENTER_X - ROAD_WIDTH / 2, CENTER_Y - ROAD_WIDTH / 2);
    ctx.fillRect(CENTER_X + ROAD_WIDTH / 2, CENTER_Y + ROAD_WIDTH / 2, CENTER_X - ROAD_WIDTH / 2, CENTER_Y - ROAD_WIDTH / 2);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(CENTER_X - ROAD_WIDTH / 2, 0, ROAD_WIDTH, canvas.height);
    ctx.fillRect(0, CENTER_Y - ROAD_WIDTH / 2, canvas.width, ROAD_WIDTH);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(CENTER_X, 0); ctx.lineTo(CENTER_X, CENTER_Y - STOP_OFFSET);
    ctx.moveTo(CENTER_X, CENTER_Y + STOP_OFFSET); ctx.lineTo(CENTER_X, canvas.height);
    ctx.moveTo(0, CENTER_Y); ctx.lineTo(CENTER_X - STOP_OFFSET, CENTER_Y);
    ctx.moveTo(CENTER_X + STOP_OFFSET, CENTER_Y); ctx.lineTo(canvas.width, CENTER_Y);
    ctx.stroke();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(CENTER_X - 30, 0); ctx.lineTo(CENTER_X - 30, CENTER_Y - STOP_OFFSET);
    ctx.moveTo(CENTER_X + 30, CENTER_Y + STOP_OFFSET); ctx.lineTo(CENTER_X + 30, canvas.height);
    ctx.moveTo(0, CENTER_Y + 30); ctx.lineTo(CENTER_X - STOP_OFFSET, CENTER_Y + 30);
    ctx.moveTo(CENTER_X + STOP_OFFSET, CENTER_Y - 30); ctx.lineTo(canvas.width, CENTER_Y - 30);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(CENTER_X - ROAD_WIDTH / 2, CENTER_Y - STOP_OFFSET);
    ctx.lineTo(CENTER_X, CENTER_Y - STOP_OFFSET);
    ctx.moveTo(CENTER_X, CENTER_Y + STOP_OFFSET);
    ctx.lineTo(CENTER_X + ROAD_WIDTH / 2, CENTER_Y + STOP_OFFSET);
    ctx.moveTo(CENTER_X + STOP_OFFSET, CENTER_Y - ROAD_WIDTH / 2);
    ctx.lineTo(CENTER_X + STOP_OFFSET, CENTER_Y);
    ctx.moveTo(CENTER_X - STOP_OFFSET, CENTER_Y);
    ctx.lineTo(CENTER_X - STOP_OFFSET, CENTER_Y + ROAD_WIDTH / 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    const drawZebra = (startX, startY, width, height, isVert) => {
      const stripes = 6;
      for (let i = 0; i < stripes; i++) {
        if (isVert) {
          ctx.fillRect(startX + i * (width / stripes), startY, (width / stripes) * 0.6, height);
        } else {
          ctx.fillRect(startX, startY + i * (height / stripes), width, (height / stripes) * 0.6);
        }
      }
    };
    drawZebra(CENTER_X - ROAD_WIDTH / 2, CENTER_Y - STOP_OFFSET - 20, ROAD_WIDTH, 16, true);
    drawZebra(CENTER_X - ROAD_WIDTH / 2, CENTER_Y + STOP_OFFSET + 4, ROAD_WIDTH, 16, true);
    drawZebra(CENTER_X - STOP_OFFSET - 20, CENTER_Y - ROAD_WIDTH / 2, 16, ROAD_WIDTH, false);
    drawZebra(CENTER_X + STOP_OFFSET + 4, CENTER_Y - ROAD_WIDTH / 2, 16, ROAD_WIDTH, false);

    vehicles.forEach(v => v.draw(ctx));

    drawSignalHead(CENTER_X - 75, CENTER_Y - STOP_OFFSET - 45, 'north');
    drawSignalHead(CENTER_X + 45, CENTER_Y + STOP_OFFSET + 10, 'south');
    drawSignalHead(CENTER_X + STOP_OFFSET + 10, CENTER_Y - 75, 'east');
    drawSignalHead(CENTER_X - STOP_OFFSET - 45, CENTER_Y + 45, 'west');

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(canvas.width - 250, 15, 235, 75);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(canvas.width - 250, 15, 235, 75);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px "JetBrains Mono", sans-serif';
    ctx.fillText(`Time Elapsed: ${Math.floor(timeElapsed)} s`, canvas.width - 235, 38);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '11px "Inter", sans-serif';
    ctx.fillText(`Interval: ${activeInterval || '08:30 - 08:45'}`, canvas.width - 235, 56);

    ctx.fillStyle = evpActive ? '#ef4444' : '#10b981';
    ctx.fillText(`Mode: ${evpActive ? '⚡ EVP EMERGENCY' : 'WEBSTER OPTIMUM'}`, canvas.width - 235, 74);
  }

  function drawSignalHead(x, y, approachKey) {
    const state = signalStates[approachKey];
    const countdown = signalCountdowns[approachKey];

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, 30, 65);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, 30, 65);

    ctx.fillStyle = (state === 'RED') ? '#ef4444' : '#450a0a';
    ctx.beginPath(); ctx.arc(x + 15, y + 12, 7, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = (state === 'YELLOW') ? '#f59e0b' : '#451a03';
    ctx.beginPath(); ctx.arc(x + 15, y + 32, 7, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = (state === 'GREEN') ? '#10b981' : '#064e3b';
    ctx.beginPath(); ctx.arc(x + 15, y + 52, 7, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#0284c7';
    ctx.fillRect(x - 5, y - 22, 40, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "JetBrains Mono", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(countdown > 0 ? countdown : '0', x + 15, y - 9);
    ctx.textAlign = 'left';
  }

  function gameLoop(timestamp) {
    if (!isRunning || isPaused) return;

    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    updateSimulation(delta);
    renderScene();

    animationFrameId = requestAnimationFrame(gameLoop);
  }

  function init(canvasId = 'trafficSimCanvas') {
    if (typeof document === 'undefined') return;

    canvas = document.getElementById(canvasId);
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    loadCSVDatasetData();
    renderScene();

    console.log('[FlowGuard 2D Sim] Engine Initialized Successfully.');
  }

  function start() {
    if (isRunning && !isPaused) return;
    isRunning = true;
    isPaused = false;
    lastTimestamp = 0;
    animationFrameId = requestAnimationFrame(gameLoop);
    console.log('[FlowGuard 2D Sim] Simulation Started.');
  }

  function pause() {
    isPaused = true;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    console.log('[FlowGuard 2D Sim] Simulation Paused.');
  }

  function reset() {
    pause();
    isRunning = false;
    isPaused = false;
    timeElapsed = 0;
    vehicles = [];
    nextVehicleId = 1;
    activePhaseIndex = 0;
    phaseTimer = phaseDurations.nsGreen;
    evpActive = false;
    renderScene();
    console.log('[FlowGuard 2D Sim] Simulation Reset.');
  }

  function setSpeed(speedVal) {
    simSpeed = parseFloat(speedVal) || 1.0;
    console.log(`[FlowGuard 2D Sim] Speed set to ${simSpeed}x`);
  }

  function setInterval(timeStr) {
    applyIntervalDemands(timeStr);
    renderScene();
  }

  const FlowGuard2D = {
    init,
    start,
    pause,
    reset,
    setSpeed,
    setInterval,
    triggerEVP,
    loadCSVDatasetData
  };

  global.FlowGuard2D = FlowGuard2D;

})(typeof window !== 'undefined' ? window : this);
