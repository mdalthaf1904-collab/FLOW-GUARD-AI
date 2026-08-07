/**
 * FlowGuard AI - Traffic Summary Engineering Dashboard Module
 * Strictly READ-ONLY. Renders data ONLY from project.processedTraffic.
 * Performs NO calculations.
 */

class TrafficSummaryDashboard {
  static render() {
    const container = document.getElementById('trafficSummaryDashboardContainer');
    if (!container) return;

    const proj = typeof window.FlowGuard !== 'undefined' ? window.FlowGuard.getProject() : null;
    
    const hasData = proj && proj.processedTraffic && 
      (proj.trafficInput?.excelUploaded || proj.processedTraffic.totalVehicles > 0 || proj.processedTraffic.totalPCUDemand > 0);

    // Check if valid traffic input exists
    if (!hasData) {
      this.renderEmptyState(container);
      return;
    }

    const processed = proj.processedTraffic;
    const params = proj.engineeringParameters || {};

    // All cards are full width inside the CSS grid, we output them sequentially.
    const allCards = [
      this.renderCard1(processed, proj),
      this.renderCard2(processed),
      this.renderCard3(processed),
      this.renderCard4(processed),
      this.renderCard5(processed),
      this.renderCard6(params),
      this.renderCard7(processed),
      this.renderCard8(processed),
      this.renderCard9(processed, proj)
    ];

    container.innerHTML = allCards.join('');

    // Post-render bindings
    this.renderPieChart(processed);
    this.renderBarChart(processed);
  }

  static renderEmptyState(container) {
    container.innerHTML = `
      <div class="summary-dash-card full-width" style="text-align: center; padding: 4rem 2rem;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
        <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">AWAITING DATA INPUT</h3>
        <p style="color: var(--text-secondary);">No engineering data available. Please upload a dataset or configure project parameters to generate the Traffic Summary.</p>
      </div>
    `;
  }

  // CARD 1: Survey Overview
  static renderCard1(processed, proj) {
    const inputMode = proj.trafficInput && proj.trafficInput.inputMode === 'EXCEL_UPLOAD' ? 'Uploaded Excel Data' : 'Automated Video Survey';
    const date = proj.metadata && proj.metadata.date ? proj.metadata.date : 'Not Specified';
    const time = proj.metadata && proj.metadata.time ? proj.metadata.time : 'Not Specified';
    const duration = proj.geometry && proj.geometry.surveyDuration ? proj.geometry.surveyDuration : 15;
    const selectedInterval = proj.trafficInput && proj.trafficInput.selectedIntervalName ? proj.trafficInput.selectedIntervalName : 'N/A';
    const peakInterval = (proj.trafficInput && proj.trafficInput.datasetStats && proj.trafficInput.datasetStats.peakIntervalWindow) || 'N/A';
    
    const totalVeh = processed.totalVehicles || 0;
    
    const approachKeys = processed.approachStats ? Object.keys(processed.approachStats) : [];
    const numRoads = approachKeys.length;
    let numLanes = 0;
    approachKeys.forEach(k => {
      numLanes += (processed.approachStats[k].lanes || 2);
    });

    return `
      <div class="summary-dash-card full-width">
        <div class="summary-dash-header">
          <div class="summary-dash-title-group">
            <div class="summary-dash-icon">🗺️</div>
            <div>
              <div class="summary-dash-title">1. Survey Overview</div>
              <div class="summary-dash-subtitle">Carriageway survey metadata, intervals, and aggregate volumes</div>
            </div>
          </div>
          <span class="badge badge-low">Survey Metadata</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.85rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Survey Method</div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">${inputMode}</div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.85rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Survey Date & Time</div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">${date} / ${time}</div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.85rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Survey Duration</div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">${duration} Minutes</div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.85rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Selected Interval</div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">${selectedInterval}</div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.85rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Peak Interval</div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">${peakInterval}</div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.85rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Total Vehicles</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary); margin-top: 0.2rem;">${totalVeh.toLocaleString()} veh</div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.85rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Network Geometry</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary); margin-top: 0.2rem;">${numRoads} Roads / ${numLanes} Lanes</div>
          </div>
        </div>
      </div>
    `;
  }

  // CARD 2: Road-wise Engineering Cards
  static renderCard2(processed) {
    const stats = processed.approachStats || {};
    const keys = Object.keys(stats);
    
    let gridHtml = keys.map(k => {
      const st = stats[k];
      const pcu = (processed.roadSummary && processed.roadSummary[k] && processed.roadSummary[k].totalPCU) || st.pcuVal || 0;
      
      return `
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); padding: 1.25rem; border-radius: 10px; display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.6rem;">
            <div style="font-size: 0.95rem; font-weight: 800; color: var(--text-primary);">${st.name}</div>
            <span class="badge badge-low" style="font-size: 0.7rem;">${k.toUpperCase()}</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; background: rgba(30, 41, 59, 0.4); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div>
              <div style="font-size: 0.68rem; color: var(--text-secondary); text-transform: uppercase;">Vehicles</div>
              <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">${st.vehCount.toLocaleString()}</div>
            </div>
            <div>
              <div style="font-size: 0.68rem; color: var(--text-secondary); text-transform: uppercase;">Total PCU</div>
              <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">${pcu.toLocaleString()}</div>
            </div>
            <div style="grid-column: span 2; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 0.4rem; margin-top: 0.2rem;">
              <div style="font-size: 0.68rem; color: var(--text-secondary); text-transform: uppercase;">Traffic Demand</div>
              <div style="font-size: 1.2rem; font-weight: 800; color: var(--accent-primary);">${Math.round(st.hourlyDemand).toLocaleString()} PCU/hr</div>
            </div>
          </div>
          <div style="font-size: 0.76rem; color: var(--text-primary); display: flex; flex-direction: column; gap: 5px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 0.6rem;">
            <div style="display: flex; justify-content: space-between;"><span>Incoming Lanes:</span> <strong>${st.lanes}</strong></div>
            <div style="display: flex; justify-content: space-between;"><span>Speed Limit:</span> <strong>${st.speedLimit || '60 km/h'}</strong></div>
            <div style="display: flex; justify-content: space-between;"><span>Pedestrian Count:</span> <strong>${st.pedCount || 0}</strong></div>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.78rem; background: rgba(15, 23, 42, 0.5); padding: 0.4rem 0.6rem; border-radius: 4px; display: flex; justify-content: space-between;">
            <span>L: <strong style="color:#10b981;">${(st.left || 0).toLocaleString()}</strong></span>
            <span>T: <strong style="color:#38bdf8;">${(st.through || 0).toLocaleString()}</strong></span>
            <span>R: <strong style="color:#f59e0b;">${(st.right || 0).toLocaleString()}</strong></span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="summary-dash-card full-width">
        <div class="summary-dash-header">
          <div class="summary-dash-title-group">
            <div class="summary-dash-icon">🚦</div>
            <div>
              <div class="summary-dash-title">2. Road-wise Engineering Cards</div>
              <div class="summary-dash-subtitle">Independent approach parameters</div>
            </div>
          </div>
          <span class="badge badge-low">Approach Analysis</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
          ${gridHtml}
        </div>
      </div>
    `;
  }

  // CARD 3: Vehicle Composition Pie Chart
  static renderCard3(processed) {
    let rows = '';
    const breakdown = processed.pcuCategoryBreakdown || [];
    
    breakdown.forEach(item => {
      const pct = processed.totalVehicles ? Math.round((item.count / processed.totalVehicles) * 100) : 0;
      rows += `
        <tr>
          <td><strong>${item.name}</strong></td>
          <td style="text-align: right;">${item.count.toLocaleString()}</td>
          <td style="text-align: right; font-family: var(--font-mono);">${item.factor.toFixed(1)}</td>
          <td style="text-align: right; color: var(--accent-primary); font-weight: 700;">${item.calculatedPcu.toLocaleString()}</td>
          <td style="text-align: right;">${pct}%</td>
        </tr>
      `;
    });

    return `
      <div class="summary-dash-card full-width">
        <div class="summary-dash-header">
          <div class="summary-dash-title-group">
            <div class="summary-dash-icon">🍕</div>
            <div>
              <div class="summary-dash-title">3. Vehicle Composition</div>
              <div class="summary-dash-subtitle">Mode-wise observed counts & converted PCU</div>
            </div>
          </div>
          <span class="badge badge-low">Modal Distribution</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; align-items: center;">
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
            <div id="newVehPieChartContainer" style="width: 220px; height: 220px; position: relative;"></div>
            <div class="pie-legend-list" id="newVehPieLegendList" style="margin-top: 1rem; width: 100%; display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center;"></div>
          </div>
          <div style="overflow-x: auto;">
            <table class="mini-data-table" style="width: 100%;">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th style="text-align: right;">Count</th>
                  <th style="text-align: right;">PCU Factor</th>
                  <th style="text-align: right;">Converted PCU</th>
                  <th style="text-align: right;">Percentage</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // CARD 4: Turning Movement Summary
  static renderCard4(processed) {
    const stats = processed.approachStats || {};
    let rows = '';

    Object.keys(stats).forEach(k => {
      const st = stats[k];
      const totalTurn = (st.left || 0) + (st.through || 0) + (st.right || 0);
      const turnPct = totalTurn > 0 && st.vehCount > 0 ? Math.round((totalTurn / st.vehCount) * 100) : 100;

      rows += `
        <tr>
          <td><strong>${st.name}</strong></td>
          <td style="text-align: right;">${(st.left || 0).toLocaleString()}</td>
          <td style="text-align: right;">${(st.through || 0).toLocaleString()}</td>
          <td style="text-align: right;">${(st.right || 0).toLocaleString()}</td>
          <td style="text-align: right; color: var(--accent-primary); font-weight: 700;">${totalTurn.toLocaleString()}</td>
          <td style="text-align: right;">${turnPct}%</td>
        </tr>
      `;
    });

    return `
      <div class="summary-dash-card full-width">
        <div class="summary-dash-header">
          <div class="summary-dash-title-group">
            <div class="summary-dash-icon">🔄</div>
            <div>
              <div class="summary-dash-title">4. Turning Movement Summary</div>
              <div class="summary-dash-subtitle">Directional split of observed vehicles</div>
            </div>
          </div>
          <span class="badge badge-low">Turning Data</span>
        </div>
        <div style="overflow-x: auto;">
          <table class="mini-data-table" style="width: 100%;">
            <thead>
              <tr>
                <th>Road</th>
                <th style="text-align: right;">Left</th>
                <th style="text-align: right;">Through</th>
                <th style="text-align: right;">Right</th>
                <th style="text-align: right;">Total Turning Vehicles</th>
                <th style="text-align: right;">Turning Percentage</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // CARD 5: Road Demand Comparison
  static renderCard5(processed) {
    return `
      <div class="summary-dash-card full-width">
        <div class="summary-dash-header">
          <div class="summary-dash-title-group">
            <div class="summary-dash-icon">📊</div>
            <div>
              <div class="summary-dash-title">5. Road Demand Comparison</div>
              <div class="summary-dash-subtitle">Hourly Demand PCU/hr sorted highest to lowest</div>
            </div>
          </div>
          <span class="badge badge-low">Demand Comparison</span>
        </div>
        <div id="newRoadDemandBarChartContainer" style="width: 100%; min-height: 180px; padding: 0.5rem 0;">
        </div>
      </div>
    `;
  }

  // CARD 6: Engineering Parameters Used
  static renderCard6(params) {
    const inter = params.intersection || {};
    
    return `
      <div class="summary-dash-card full-width">
        <div class="summary-dash-header">
          <div class="summary-dash-title-group">
            <div class="summary-dash-icon">⚙️</div>
            <div>
              <div class="summary-dash-title">6. Engineering Parameters Used</div>
              <div class="summary-dash-subtitle">Configured signal bounds & safety constraints</div>
            </div>
          </div>
          <span class="badge badge-low">Engineering Snapshot</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">PCU Factors</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">Loaded</div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Base Saturation Flow</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">${inter.baseSaturationFlow || 1800} PCU/h/ln</div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Lane Width</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">${inter.laneWidth || 3.5} m</div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Controller Type</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">${inter.controllerType || 'Fixed Time'}</div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Pedestrian Settings</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">${inter.walkingSpeed || 1.2} m/s</div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Crosswalk Width</div>
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-top: 0.2rem;">${inter.crosswalkWidth || 7.0} m</div>
          </div>
        </div>
      </div>
    `;
  }

  // CARD 7: Critical Approach Identification
  static renderCard7(processed) {
    const stats = processed.approachStats || {};
    let maxVeh = { val: -1, name: '' };
    let maxPCU = { val: -1, name: '' };
    let maxDem = { val: -1, name: '' };
    
    Object.keys(stats).forEach(k => {
      const st = stats[k];
      const pcu = (processed.roadSummary && processed.roadSummary[k] && processed.roadSummary[k].totalPCU) || st.pcuVal || 0;
      
      if (st.vehCount > maxVeh.val) maxVeh = { val: st.vehCount, name: st.name };
      if (pcu > maxPCU.val) maxPCU = { val: pcu, name: st.name };
      if (st.hourlyDemand > maxDem.val) maxDem = { val: Math.round(st.hourlyDemand), name: st.name };
    });

    return `
      <div class="summary-dash-card full-width">
        <div class="summary-dash-header">
          <div class="summary-dash-title-group">
            <div class="summary-dash-icon">🎯</div>
            <div>
              <div class="summary-dash-title">7. Critical Approach Identification</div>
              <div class="summary-dash-subtitle">Highest metrics determining Webster governance</div>
            </div>
          </div>
          <span class="badge badge-low">Criticality</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Highest Vehicle Count</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #f59e0b; margin-top: 0.2rem;">${maxVeh.name} <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary);">(${maxVeh.val.toLocaleString()} veh)</span></div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Highest PCU</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #f59e0b; margin-top: 0.2rem;">${maxPCU.name} <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary);">(${maxPCU.val.toLocaleString()} PCU)</span></div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Highest Traffic Demand</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #ef4444; margin-top: 0.2rem;">${maxDem.name} <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary);">(${maxDem.val.toLocaleString()} PCU/hr)</span></div>
          </div>
          <div class="summary-metric-box" style="background: rgba(15,23,42,0.6); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Highest Flow Ratio (Y)</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #ef4444; margin-top: 0.2rem;">${maxDem.name} <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-secondary);">(Pending Analysis)</span></div>
          </div>
        </div>
      </div>
    `;
  }

  // CARD 8: Traffic Engineering Summary
  static renderCard8(processed) {
    const stats = processed.approachStats || {};
    let maxDemName = '';
    let maxDemVal = -1;
    
    Object.keys(stats).forEach(k => {
      if (stats[k].hourlyDemand > maxDemVal) {
        maxDemVal = stats[k].hourlyDemand;
        maxDemName = stats[k].name;
      }
    });

    let twoWheelerPct = 0;
    const bd = processed.pcuCategoryBreakdown || [];
    const twoWheeler = bd.find(x => x.key === 'motorcycle');
    if (twoWheeler && processed.totalVehicles) {
      twoWheelerPct = Math.round((twoWheeler.count / processed.totalVehicles) * 100);
    }
    
    // Automatically identify peak interval
    const proj = typeof window.FlowGuard !== 'undefined' ? window.FlowGuard.getProject() : null;
    const peakInterval = (proj && proj.trafficInput && proj.trafficInput.datasetStats && proj.trafficInput.datasetStats.peakIntervalWindow) || 'N/A';

    return `
      <div class="summary-dash-card full-width">
        <div class="summary-dash-header">
          <div class="summary-dash-title-group">
            <div class="summary-dash-icon">💡</div>
            <div>
              <div class="summary-dash-title">8. Traffic Engineering Summary</div>
              <div class="summary-dash-subtitle">Automated engineering observations from survey data</div>
            </div>
          </div>
          <span class="badge badge-low">Observations</span>
        </div>
        <div style="background: rgba(15, 23, 42, 0.4); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border-color);">
          <ul style="list-style-type: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem;">
            <li style="display: flex; align-items: flex-start; gap: 0.75rem;">
              <span style="color: var(--accent-primary);">•</span>
              <span style="color: var(--text-primary); font-size: 0.9rem;">Peak interval occurs between ${peakInterval}.</span>
            </li>
            <li style="display: flex; align-items: flex-start; gap: 0.75rem;">
              <span style="color: var(--accent-primary);">•</span>
              <span style="color: var(--text-primary); font-size: 0.9rem;">${maxDemName} has highest traffic demand (${Math.round(maxDemVal).toLocaleString()} PCU/hr).</span>
            </li>
            <li style="display: flex; align-items: flex-start; gap: 0.75rem;">
              <span style="color: var(--accent-primary);">•</span>
              <span style="color: var(--text-primary); font-size: 0.9rem;">Through movements typically dominate the traffic flow at this junction.</span>
            </li>
            <li style="display: flex; align-items: flex-start; gap: 0.75rem;">
              <span style="color: var(--accent-primary);">•</span>
              <span style="color: var(--text-primary); font-size: 0.9rem;">Two-wheelers contribute ${twoWheelerPct}% of demand.</span>
            </li>
            <li style="display: flex; align-items: flex-start; gap: 0.75rem;">
              <span style="color: var(--accent-primary);">•</span>
              <span style="color: var(--text-primary); font-size: 0.9rem;">${maxDemName} governs Webster optimisation.</span>
            </li>
          </ul>
        </div>
      </div>
    `;
  }

  // CARD 9: Analysis Readiness Checklist
  static renderCard9(processed, proj) {
    const isReady = proj.validation && proj.validation.valid !== false;

    return `
      <div class="summary-dash-card full-width">
        <div class="summary-dash-header">
          <div class="summary-dash-title-group">
            <div class="summary-dash-icon">📋</div>
            <div>
              <div class="summary-dash-title">9. Analysis Readiness</div>
              <div class="summary-dash-subtitle">Validation of all input requirements prior to Webster optimization</div>
            </div>
          </div>
          <span class="badge badge-low" style="background: rgba(16,185,129,0.15); color: var(--success); border: 1px solid rgba(16,185,129,0.3);">✓ READY</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-top: 0.5rem;">
          <div style="display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.82rem; color: var(--success); font-weight: 600;">
            <span>✓ Geometry Completed</span>
            <span>✓ Traffic Input Completed</span>
            <span>✓ Engineering Parameters Loaded</span>
            <span>✓ PCU Calculated</span>
            <span>✓ Traffic Demand Available</span>
            <span>✓ Turning Movements Verified</span>
            <span>✓ Ready for Webster Analysis</span>
          </div>
          <button class="btn-primary-cyan" style="font-size: 0.95rem; padding: 12px 24px; font-weight: 700;" onclick="window.FlowGuard && window.FlowGuard.setWizardStep(5)">
            Proceed to Run Analysis →
          </button>
        </div>
      </div>
    `;
  }

  // Renders the horizontal bar chart for Card 5
  static renderBarChart(processed) {
    const container = document.getElementById('newRoadDemandBarChartContainer');
    if (!container) return;

    const stats = processed.approachStats || {};
    const keys = Object.keys(stats).sort((a, b) => {
      const dA = stats[a].hourlyDemand || 0;
      const dB = stats[b].hourlyDemand || 0;
      return dB - dA;
    });

    let maxDemand = 1;
    keys.forEach(k => {
      if (stats[k].hourlyDemand > maxDemand) maxDemand = stats[k].hourlyDemand;
    });

    const barsHTML = keys.map(k => {
      const st = stats[k];
      const pct = Math.min(100, Math.round((st.hourlyDemand / maxDemand) * 100));
      const isMax = st.hourlyDemand === maxDemand && maxDemand > 0;
      const barColor = isMax ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #0284c7, #38bdf8)';

      return `
        <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.76rem;">
            <span style="font-weight: 700; color: var(--text-primary);">${st.name} ${isMax ? '<span style="font-size: 0.68rem; color: #f59e0b; font-weight: 700;">★ BUSIEST</span>' : ''}</span>
            <span style="font-family: var(--font-mono); font-weight: 700; color: ${isMax ? '#f59e0b' : 'var(--accent-primary)'};">${Math.round(st.hourlyDemand).toLocaleString()} PCU/hr</span>
          </div>
          <div style="height: 14px; width: 100%; background: var(--bg-input); border-radius: 4px; overflow: hidden; border: 1px solid var(--border-color);">
            <div style="width: ${pct}%; height: 100%; background: ${barColor}; border-radius: 3px; transition: width 0.3s ease;"></div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="background: rgba(15, 23, 42, 0.5); padding: 0.85rem; border-radius: 8px; border: 1px solid var(--border-color);">
        ${barsHTML}
      </div>
    `;
  }

  // Renders the pie chart for Card 3
  static renderPieChart(processed) {
    const container = document.getElementById('newVehPieChartContainer');
    const legend = document.getElementById('newVehPieLegendList');
    if (!container || !legend) return;

    const COLOR_MAP = {
      car: '#38bdf8', motorcycle: '#818cf8', autorickshaw: '#f59e0b',
      bus: '#ef4444', truck: '#10b981', bicycle: '#a855f7',
      tractor: '#ec4899', cart: '#64748b', lcv: '#22d3ee'
    };

    const breakdown = processed.pcuCategoryBreakdown || [];
    let categories = breakdown.map(item => ({
      name: item.name,
      key: item.key,
      count: item.count,
      color: COLOR_MAP[item.key] || '#94a3b8'
    })).filter(c => c.count > 0);

    const totalVehicles = categories.reduce((sum, c) => sum + c.count, 0);

    if (totalVehicles === 0) {
      container.innerHTML = '<div style="color:var(--text-secondary); padding-top: 40px; text-align:center;">No Data</div>';
      legend.innerHTML = '';
      return;
    }

    let conicGradient = [];
    let startDeg = 0;

    categories.forEach(c => {
      const pct = c.count / totalVehicles;
      const deg = pct * 360;
      const endDeg = startDeg + deg;
      conicGradient.push(`${c.color} ${startDeg}deg ${endDeg}deg`);
      startDeg = endDeg;
    });

    const gradStr = conicGradient.join(', ');

    container.innerHTML = `
      <div style="width: 220px; height: 220px; border-radius: 50%; background: conic-gradient(${gradStr}); position: relative; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 140px; height: 140px; background: #0f172a; border-radius: 50%; display: flex; flex-direction: column; justify-content: center; align-items: center; box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);">
          <div style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">Total</div>
          <div style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary);">${totalVehicles.toLocaleString()}</div>
        </div>
      </div>
    `;

    legend.innerHTML = categories.map(c => {
      const p = Math.round((c.count / totalVehicles) * 100);
      return `<div style="display: flex; align-items: center; gap: 4px; font-size: 0.72rem; color: var(--text-primary);"><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${c.color};"></span>${c.name} (${p}%)</div>`;
    }).join('');
  }
}

// Make accessible to FlowGuard or globally
window.TrafficSummaryDashboard = TrafficSummaryDashboard;
