/**
 * FlowGuard AI — Gemini AI Assistant Module
 * Intelligent Traffic Data QA & Analysis Assistant powered by Google Gemini API
 */

(function () {
  'use strict';

  const GEMINI_STORAGE_KEY = 'flowguard_gemini_api_key';
  const GEMINI_MODEL = 'gemini-2.5-flash';

  let _chatHistory = [];
  let _isGenerating = false;
  let _isOpen = false;

  let _inMemoryApiKey = '';

  /**
   * Helper to retrieve stored Gemini API key
   */
  function getApiKey() {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(GEMINI_STORAGE_KEY) || _inMemoryApiKey || '';
      }
    } catch (e) {
      console.warn('[Gemini AI] Storage access error:', e);
    }
    return _inMemoryApiKey || '';
  }

  /**
   * Helper to save Gemini API key
   */
  function saveApiKey(key) {
    _inMemoryApiKey = key ? key.trim() : '';
    try {
      if (typeof localStorage !== 'undefined') {
        if (key) {
          localStorage.setItem(GEMINI_STORAGE_KEY, key.trim());
        } else {
          localStorage.removeItem(GEMINI_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.warn('[Gemini AI] Storage write error:', e);
    }
    updateStatusBadge();
  }

  /**
   * Build comprehensive CSV dataset context from FlowGuard AI state
   */
  function buildDatasetContext() {
    const FlowGuard = window.FlowGuard;
    if (!FlowGuard || typeof FlowGuard.loadProject !== 'function') {
      return { hasDataset: false, text: 'No FlowGuard engine available.' };
    }

    const project = FlowGuard.loadProject() || {};
    const ds = project.dataset || {};
    const ti = project.trafficInput || {};
    const pt = project.processedTraffic || {};
    const geom = project.geometry || {};
    const normData = project.normalizedTrafficData || {};
    const currentResult = (typeof FlowGuard.getCurrentAnalysisResult === 'function')
      ? FlowGuard.getCurrentAnalysisResult()
      : (project.lastAnalysisResult || null);

    const isUploaded = Boolean(
      (ds && (ds.uploaded || (ds.records && ds.records.length > 0))) ||
      (ti && (ti.datasetUploaded || ti.excelUploaded || (ti.totalConvertedPCU && ti.totalConvertedPCU > 0))) ||
      (pt && (pt.north || (pt.totalPCUDemand && pt.totalPCUDemand > 0)))
    );

    if (!isUploaded) {
      return {
        hasDataset: false,
        text: `NO CSV DATASET UPLOADED YET.
The user has not uploaded a traffic dataset file in Step 2.
Current state: Geometry standard configured (${geom.configType || '4CROSS'}), but no traffic survey dataset records exist.`
      };
    }

    // Gather dataset parameters
    const totalVehicles = pt.totalVehicles || ds.totalVehicles || ti.totalVehicles || 0;
    const totalPCU = pt.totalPCU || pt.totalPCUDemand || ds.totalPCU || ti.totalConvertedPCU || 0;
    const surveyDate = ds.surveyDate || 'N/A';
    const surveyDuration = ds.surveyDuration || '24 Hours';
    const numIntervals = ds.numIntervals || (ds.intervals ? ds.intervals.length : 'N/A');
    const peakInterval = ds.peakInterval || (ti.peakInterval ? (ti.peakInterval.timeWindow || ti.peakInterval.time) : '08:45–09:00');
    const rowsRead = ds.parsedRecords || (ds.records ? ds.records.length : 0);

    // Per-Road breakdown
    const roads = ['north', 'east', 'south', 'west'];
    const roadTitles = {
      north: 'Road A (Northbound)',
      east: 'Road B (Eastbound)',
      south: 'Road C (Southbound)',
      west: 'Road D (Westbound)'
    };

    let roadsSummaryText = '';
    roads.forEach(r => {
      const roadData = pt[r] || {};
      const normRoad = (normData.roads && normData.roads[r]) ? normData.roads[r] : {};
      const customName = (geom.roadNames && geom.roadNames[r]) ? geom.roadNames[r] : '';
      const title = customName ? `${customName} — ${roadTitles[r]}` : roadTitles[r];
      const lanes = (geom.approaches && geom.approaches[r] && geom.approaches[r].incomingLanes)
        ? geom.approaches[r].incomingLanes
        : ((geom.laneCounts && geom.laneCounts[r]) || 2);

      const vehCount = roadData.totalVehicles !== undefined ? roadData.totalVehicles : 0;
      const peakHourPCU = normRoad.peakHourPCU || roadData.hourlyDemand || 0;
      const satFlow = normRoad.saturationFlowS || roadData.satFlow || (1800 * lanes);
      const flowRatioY = normRoad.flowRatioY !== undefined ? normRoad.flowRatioY : (roadData.flowRatioY || 0);
      const critMove = normRoad.criticalMovement || (roadData.websterInputs ? roadData.websterInputs.criticalMovement : 'Through');

      const mvPcu = roadData.movementPCU || {};
      const leftPcu = normRoad.normalizedMovementPCU ? normRoad.normalizedMovementPCU.left : (mvPcu.leftPCU || 0);
      const throughPcu = normRoad.normalizedMovementPCU ? normRoad.normalizedMovementPCU.through : (mvPcu.throughPCU || 0);
      const rightPcu = normRoad.normalizedMovementPCU ? normRoad.normalizedMovementPCU.right : (mvPcu.rightPCU || 0);

      roadsSummaryText += `
- ${title}:
  * Lanes: ${lanes}
  * Observed Interval Vehicle Count: ${vehCount} veh
  * Normalized Peak-Hour PCU Demand: ${peakHourPCU} PCU/h
  * Critical Movement: ${critMove} (Critical Flow q: ${normRoad.criticalFlowQ || Math.max(leftPcu, throughPcu, rightPcu)} PCU/h)
  * Saturation Flow Rate (S): ${satFlow} PCU/h
  * Flow Ratio (y = q/s): ${flowRatioY}
  * Turning Movement PCU (Peak-Hour): Left=${leftPcu} PCU/h, Through=${throughPcu} PCU/h, Right=${rightPcu} PCU/h`;
    });

    // Vehicle composition breakdown across network
    let vehCompText = '';
    const vehicleComp = pt.intersection ? pt.intersection.vehicleComposition : (pt.pcuCategoryBreakdown || []);
    if (Array.isArray(vehicleComp) && vehicleComp.length > 0) {
      vehCompText = vehicleComp.map(v => `  * ${v.name || v.key || v.category}: ${v.count || 0} vehicles (${v.pct || 0}%, PCU Factor: ${v.factor || 1.0}, PCU: ${v.calculatedPcu || v.pcu || 0})`).join('\n');
    } else {
      vehCompText = '  * Detailed modal breakdown processed in Step 3/Step 4';
    }

    // Analysis results (if Step 5 executed)
    let analysisResultText = 'Not executed yet.';
    if (currentResult && currentResult.analysisCompleted) {
      const crit = currentResult.criticalAnalysis || {};
      const web = currentResult.websterTiming || {};
      analysisResultText = `
- Bottleneck Approach: ${crit.criticalApproach || 'N/A'}
- Sum of Flow Ratios (Total Y): ${crit.totalY || 'N/A'}
- Intersection Webster Feasibility: ${crit.isWebsterValid ? 'FEASIBLE (Optimum cycle calculated)' : 'OVERSATURATED (Total Y >= 1.00)'}
- Theoretical Webster Cycle (C0): ${web.websterCycleC0 ? `${web.websterCycleC0} s` : 'N/A'}
- Applied Signal Cycle: ${web.appliedCycle ? `${web.appliedCycle} s` : 'N/A'}
- Signal Phase Model: ${crit.phaseMode || '2-phase'} (${crit.numPhases || 2} Phases)
- Green Splits: ${web.numPhases === 4 ? `Phase 1=${web.g1}s, Phase 2=${web.g2}s, Phase 3=${web.g3}s, Phase 4=${web.g4}s` : `Phase 1=${web.g1}s, Phase 2=${web.g2}s`}`;
    }

    // First sample records from raw dataset (up to 5 records for direct context grounding)
    let recordsSampleText = '';
    if (ds.records && ds.records.length > 0) {
      const sample = ds.records.slice(0, 8);
      recordsSampleText = sample.map((rec, idx) => {
        const time = rec.timeWindow || rec.time || rec.Time || rec['Time Interval'] || 'Interval ' + (idx + 1);
        const rd = rec.road || rec.Road || rec.approach || 'Road';
        const mov = rec.movement || rec.Movement || 'Through';
        const veh = rec.vehicleType || rec.vehicletype || rec.Category || 'Car';
        const cnt = rec.count !== undefined ? rec.count : (rec.totalVehicles || rec.Volume || 0);
        return `  Row ${idx + 1}: Time=${time} | Road=${rd} | Movement=${mov} | VehicleType=${veh} | Count=${cnt}`;
      }).join('\n');
    }

    const fullContextPrompt = `
UPLOADED CSV TRAFFIC DATASET CONTEXT (FlowGuard AI Single Source of Truth):
===========================================================================
Dataset Upload Status: VALIDATED & INGESTED
Survey Date: ${surveyDate}
Survey Window Duration: ${surveyDuration} (${numIntervals} unique intervals)
Total Parsed Dataset Rows: ${rowsRead} rows
Total Network Physical Vehicles Recorded: ${totalVehicles} veh
Total Network PCU Demand: ${totalPCU} PCU
Peak Surge Survey Interval: ${peakInterval}

APPROACH ROAD TRAFFIC DEMAND SUMMARY (IRC:106 PCU Standardized):
===========================================================================
${roadsSummaryText}

NETWORK VEHICLE TYPE COMPOSITION:
===========================================================================
${vehCompText}

STEP 5 WEBSTER SIGNAL OPTIMIZATION & ENGINEERING ANALYSIS:
===========================================================================
${analysisResultText}

SAMPLE RAW DATASET RECORDS (Snapshot):
===========================================================================
${recordsSampleText || 'All parsed dataset records integrated into Single Source of Truth metrics.'}
===========================================================================`;

    return {
      hasDataset: true,
      text: fullContextPrompt.trim()
    };
  }

  /**
   * Lightweight markdown to HTML renderer for clean AI responses
   */
  function renderMarkdown(mdText) {
    if (!mdText) return '';
    if (typeof window !== 'undefined' && window.marked && typeof window.marked.parse === 'function') {
      try {
        return window.marked.parse(mdText);
      } catch (e) {
        // fallback
      }
    }

    // Fallback built-in Markdown Parser
    let html = mdText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    // Bullet lists
    html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>');
    // Paragraph breaks
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  /**
   * Send question to Google Gemini API
   */
  async function askGemini(userQuestion) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('MISSING_API_KEY');
    }

    const datasetContext = buildDatasetContext();

    const systemInstruction = `You are FlowGuard AI's Traffic Engineering Assistant, an expert AI specialized in traffic data analysis, IRC:93 signal design, IRC:106 PCU equivalency standards, Webster signal timing optimization, and capacity analysis.

Your core responsibility is to answer user questions accurately based on their uploaded CSV traffic dataset and intersection geometry context.

Guidelines:
1. Base your factual answers directly on the UPLOADED CSV TRAFFIC DATASET CONTEXT provided.
2. Be precise with numbers: distinguish clearly between observed physical vehicle counts (veh), observed PCU demand per interval, and normalized peak-hour PCU/h.
3. Reference specific roads (Road A/North, Road B/East, Road C/South, Road D/West), peak intervals, critical movements, flow ratios (y), and Webster cycle allocations where applicable.
4. Format your response clearly using markdown formatting (bullet points, bold text, short tables, or structured headings).
5. Maintain a professional, engineering-grade, helpful tone.`;

    const contentsPayload = [
      {
        role: 'user',
        parts: [
          { text: systemInstruction + '\n\n' + datasetContext.text },
          ..._chatHistory.map(msg => ({ text: `${msg.role.toUpperCase()}: ${msg.content}` })),
          { text: `USER QUESTION: ${userQuestion}` }
        ]
      }
    ];

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: contentsPayload,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1200
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMessage = (errData.error && errData.error.message) ? errData.error.message : `Gemini API HTTP Error ${response.status}`;
      if (response.status === 400 && errMessage.includes('API key')) {
        throw new Error('INVALID_API_KEY');
      }
      throw new Error(errMessage);
    }

    const data = await response.json();

    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      const text = data.candidates[0].content.parts.map(p => p.text).join('\n');
      return text;
    } else {
      throw new Error('Empty response received from Gemini AI.');
    }
  }

  /**
   * UI: Render Assistant Drawer & Floating Action Button
   */
  function injectAssistantUI() {
    if (typeof document === 'undefined' || document.getElementById('geminiAssistantDrawer')) return;

    // 1. Floating Compact Dot Button
    const fab = document.createElement('button');
    fab.id = 'geminiFabBtn';
    fab.className = 'gemini-fab-btn';
    fab.setAttribute('title', '✨ Gemini AI Assistant — Click to open AI chat');
    fab.setAttribute('aria-label', 'Gemini AI Assistant');
    fab.innerHTML = `<span class="gemini-fab-icon">✨</span><span class="gemini-fab-dot" id="geminiFabDot"></span>`;
    fab.onclick = toggleChat;
    document.body.appendChild(fab);

    // 2. Chat Drawer Modal Panel
    const drawer = document.createElement('div');
    drawer.id = 'geminiAssistantDrawer';
    drawer.className = 'gemini-drawer-panel';
    drawer.style.display = 'none';

    drawer.innerHTML = `
      <div class="gemini-drawer-header">
        <div class="gemini-header-title">
          <span class="gemini-sparkle-icon">✨</span>
          <div>
            <div class="gemini-title-main">Gemini Traffic AI Assistant</div>
            <div class="gemini-subtitle" id="geminiSubtitle">Powered by Google Gemini 2.5 Flash</div>
          </div>
        </div>
        <div class="gemini-header-actions">
          <button class="gemini-btn-icon" id="btnGeminiSettings" onclick="FlowGuardGemini.toggleApiKeyInput()" title="Configure Gemini API Key">⚙️ Key</button>
          <button class="gemini-btn-icon" onclick="FlowGuardGemini.clearChat()" title="Clear Chat History">🗑️</button>
          <button class="gemini-btn-icon" onclick="FlowGuardGemini.toggleChat()" title="Close Assistant">✕</button>
        </div>
      </div>

      <!-- API Key Setup Banner (Inline Dropdown) -->
      <div class="gemini-key-config-box" id="geminiKeyBox" style="display: none;">
        <div style="font-size: 0.78rem; font-weight: 700; color: var(--accent-primary); margin-bottom: 0.4rem;">🔑 Configure Google Gemini API Key</div>
        <div style="font-size: 0.74rem; color: var(--text-secondary); margin-bottom: 0.6rem; line-height: 1.35;">
          Enter your Gemini API key to enable AI answers based on your uploaded CSV dataset. Key is stored locally in your browser.
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <input type="password" id="geminiApiKeyInput" class="gemini-input-key" placeholder="AIzaSy..." />
          <button class="gemini-btn-save-key" onclick="FlowGuardGemini.saveKeyFromInput()">Save</button>
        </div>
        <div id="geminiKeyStatusMsg" style="font-size: 0.72rem; margin-top: 0.35rem; font-weight: 600;"></div>
      </div>

      <!-- Dataset Status Pill -->
      <div class="gemini-dataset-status-bar" id="geminiDatasetPill">
        <span id="geminiStatusDot" class="status-dot"></span>
        <span id="geminiStatusText">Checking dataset status...</span>
      </div>

      <!-- Chat Conversation Box -->
      <div class="gemini-chat-body" id="geminiChatBody">
        <div class="gemini-welcome-card">
          <div style="font-weight: 800; font-size: 0.95rem; color: var(--accent-primary); margin-bottom: 0.4rem;">👋 Hello! I am your Traffic Engineering AI.</div>
          <div style="font-size: 0.82rem; color: var(--text-primary); line-height: 1.45;">
            Ask me any questions about your <strong>uploaded CSV traffic dataset</strong>, volume surges, peak intervals, vehicle compositions, or Webster signal timing!
          </div>

          <div style="margin-top: 0.85rem; font-size: 0.76rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em;">Suggested Prompts:</div>
          <div class="gemini-suggestion-chips">
            <button class="gemini-chip" onclick="FlowGuardGemini.sendPrompt('Summarize the overall uploaded CSV traffic dataset.')">📊 Summarize CSV dataset</button>
            <button class="gemini-chip" onclick="FlowGuardGemini.sendPrompt('Which approach has the highest peak traffic demand and flow ratio?')">🚗 Identify Peak Bottleneck</button>
            <button class="gemini-chip" onclick="FlowGuardGemini.sendPrompt('Provide a breakdown of vehicle types and turning movements.')">📈 Vehicle & Turning Breakdown</button>
            <button class="gemini-chip" onclick="FlowGuardGemini.sendPrompt('What signal timing and Webster cycle recommendations do you suggest based on this CSV data?')">🚦 Signal Timing Analysis</button>
          </div>
        </div>
      </div>

      <!-- Chat Input Toolbar -->
      <div class="gemini-chat-footer">
        <div class="gemini-input-wrapper">
          <textarea id="geminiChatInput" class="gemini-chat-textarea" placeholder="Ask a question about your uploaded CSV traffic data..." rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();FlowGuardGemini.submitMessage();}"></textarea>
          <button class="gemini-btn-send" id="btnGeminiSend" onclick="FlowGuardGemini.submitMessage()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(drawer);
    injectStyles();
    updateStatusBadge();
  }

  /**
   * Inject CSS styles for Gemini AI Assistant UI
   */
  function injectStyles() {
    if (document.getElementById('geminiAssistantStyles')) return;
    const style = document.createElement('style');
    style.id = 'geminiAssistantStyles';
    style.textContent = `
      /* Gemini FAB Compact Floating Circle Button */
      .gemini-fab-btn {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        z-index: 99990;
        background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
        color: #ffffff;
        border: 1.5px solid rgba(56, 189, 248, 0.5);
        padding: 0;
        font-family: var(--font-family, system-ui, sans-serif);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 6px 20px rgba(2, 132, 199, 0.4), 0 2px 8px rgba(0,0,0,0.4);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .gemini-fab-btn:hover {
        transform: translateY(-2px) scale(1.08);
        box-shadow: 0 10px 25px rgba(56, 189, 248, 0.6);
        background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%);
      }
      .gemini-fab-icon {
        font-size: 1.35rem;
        line-height: 1;
      }
      .gemini-fab-dot {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #10b981;
        border: 2px solid #0f172a;
        box-shadow: 0 0 6px #10b981;
      }

      /* Top Navbar Button */
      .btn-gemini-ai {
        background: rgba(56, 189, 248, 0.12);
        color: #38bdf8;
        border: 1px solid rgba(56, 189, 248, 0.35);
        padding: 4px 10px;
        border-radius: 6px;
        font-family: inherit;
        font-size: 0.78rem;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        transition: all 0.2s ease;
      }
      .btn-gemini-ai:hover {
        background: rgba(56, 189, 248, 0.25);
        border-color: #38bdf8;
        color: #ffffff;
      }

      /* Drawer Panel Container */
      .gemini-drawer-panel {
        position: fixed;
        bottom: 80px;
        right: 24px;
        width: 420px;
        max-width: calc(100vw - 32px);
        height: 600px;
        max-height: calc(100vh - 110px);
        z-index: 99995;
        background: #0f172a;
        border: 1px solid rgba(56, 189, 248, 0.3);
        border-radius: 14px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.15);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: var(--font-family, system-ui, sans-serif);
        animation: geminiSlideUp 0.25s ease-out forwards;
      }
      @keyframes geminiSlideUp {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Header */
      .gemini-drawer-header {
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding: 12px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .gemini-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .gemini-sparkle-icon {
        font-size: 1.25rem;
      }
      .gemini-title-main {
        font-weight: 800;
        font-size: 0.92rem;
        color: #f8fafc;
      }
      .gemini-subtitle {
        font-size: 0.7rem;
        color: #94a3b8;
      }
      .gemini-header-actions {
        display: flex;
        gap: 4px;
      }
      .gemini-btn-icon {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #cbd5e1;
        padding: 4px 8px;
        border-radius: 5px;
        font-size: 0.75rem;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .gemini-btn-icon:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #ffffff;
      }

      /* Key Config Box */
      .gemini-key-config-box {
        background: rgba(30, 41, 59, 0.95);
        border-bottom: 1px solid rgba(56, 189, 248, 0.2);
        padding: 10px 14px;
      }
      .gemini-input-key {
        flex: 1;
        background: #090d16;
        border: 1px solid rgba(56, 189, 248, 0.3);
        border-radius: 5px;
        padding: 6px 10px;
        color: #ffffff;
        font-size: 0.8rem;
        font-family: monospace;
      }
      .gemini-btn-save-key {
        background: #0284c7;
        color: #fff;
        border: none;
        padding: 6px 12px;
        border-radius: 5px;
        font-weight: 700;
        font-size: 0.78rem;
        cursor: pointer;
      }

      /* Dataset Status Bar */
      .gemini-dataset-status-bar {
        background: rgba(15, 23, 42, 0.8);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        padding: 6px 14px;
        font-size: 0.72rem;
        color: #cbd5e1;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        display: inline-block;
      }
      .status-dot.green { background: #10b981; box-shadow: 0 0 6px #10b981; }
      .status-dot.yellow { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; }
      .status-dot.red { background: #ef4444; }

      /* Chat Body */
      .gemini-chat-body {
        flex: 1;
        overflow-y: auto;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .gemini-welcome-card {
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(56, 189, 248, 0.2);
        border-radius: 10px;
        padding: 12px;
      }
      .gemini-suggestion-chips {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 8px;
      }
      .gemini-chip {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(56, 189, 248, 0.25);
        color: #38bdf8;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 0.78rem;
        text-align: left;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
      }
      .gemini-chip:hover {
        background: rgba(56, 189, 248, 0.15);
        border-color: #38bdf8;
        color: #ffffff;
      }

      /* Messages */
      .gemini-msg {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-width: 90%;
      }
      .gemini-msg.user {
        align-self: flex-end;
      }
      .gemini-msg.assistant {
        align-self: flex-start;
      }
      .gemini-msg-bubble {
        padding: 10px 12px;
        border-radius: 10px;
        font-size: 0.83rem;
        line-height: 1.5;
        word-break: break-word;
      }
      .gemini-msg.user .gemini-msg-bubble {
        background: #0284c7;
        color: #ffffff;
        border-bottom-right-radius: 2px;
      }
      .gemini-msg.assistant .gemini-msg-bubble {
        background: rgba(30, 41, 59, 0.85);
        color: #f1f5f9;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-bottom-left-radius: 2px;
      }
      .gemini-msg-bubble p { margin-bottom: 0.5rem; }
      .gemini-msg-bubble p:last-child { margin-bottom: 0; }
      .gemini-msg-bubble ul, .gemini-msg-bubble ol { margin: 0.4rem 0 0.4rem 1.2rem; }
      .gemini-msg-bubble li { margin-bottom: 0.2rem; }
      .gemini-msg-bubble strong { color: #38bdf8; }
      .gemini-msg-bubble code { background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 0.78rem; }
      .gemini-msg-bubble pre { background: #090d16; padding: 8px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 0.76rem; }

      /* Footer Input */
      .gemini-chat-footer {
        background: #090d16;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        padding: 10px 12px;
      }
      .gemini-input-wrapper {
        display: flex;
        gap: 8px;
        align-items: center;
        background: #1e293b;
        border: 1px solid rgba(56, 189, 248, 0.25);
        border-radius: 8px;
        padding: 4px 8px;
      }
      .gemini-chat-textarea {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: #ffffff;
        font-family: inherit;
        font-size: 0.84rem;
        resize: none;
        max-height: 80px;
      }
      .gemini-btn-send {
        background: #0284c7;
        color: #ffffff;
        border: none;
        border-radius: 6px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .gemini-btn-send:hover {
        background: #38bdf8;
      }
      .gemini-btn-send:disabled {
        background: #334155;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update status bar pill inside the chat drawer
   */
  function updateStatusBadge() {
    if (typeof document === 'undefined') return;
    const dot = document.getElementById('geminiStatusDot');
    const text = document.getElementById('geminiStatusText');
    const keyInput = document.getElementById('geminiApiKeyInput');
    const keyBox = document.getElementById('geminiKeyBox');

    if (!dot || !text) return;

    const apiKey = getApiKey();
    if (keyInput && apiKey && !keyInput.value) {
      keyInput.value = apiKey;
    }

    const FlowGuard = window.FlowGuard;
    const project = FlowGuard ? FlowGuard.loadProject() : null;
    const ds = project ? project.dataset : null;
    const ti = project ? project.trafficInput : null;
    const isUploaded = Boolean(ds && (ds.uploaded || (ds.records && ds.records.length > 0)) || (ti && ti.datasetUploaded));

    const fabDot = document.getElementById('geminiFabDot');
    if (fabDot) {
      fabDot.style.background = (!apiKey) ? '#f59e0b' : (isUploaded ? '#10b981' : '#38bdf8');
      fabDot.style.boxShadow = (!apiKey) ? '0 0 6px #f59e0b' : (isUploaded ? '0 0 6px #10b981' : '0 0 6px #38bdf8');
    }

    if (!apiKey) {
      dot.className = 'status-dot yellow';
      text.textContent = 'API Key Required — Click ⚙️ Key above to set key';
      if (keyBox && !_isOpen) keyBox.style.display = 'block';
    } else if (isUploaded) {
      dot.className = 'status-dot green';
      text.textContent = `CSV Dataset Connected (${ds.records ? ds.records.length : (ds.parsedRecords || 0)} records loaded)`;
    } else {
      dot.className = 'status-dot yellow';
      text.textContent = 'No CSV Dataset uploaded (Ready for general questions)';
    }
  }

  /**
   * Toggle Gemini AI Drawer view
   */
  function toggleChat() {
    const drawer = document.getElementById('geminiAssistantDrawer');
    if (!drawer) {
      injectAssistantUI();
      toggleChat();
      return;
    }
    _isOpen = !_isOpen;
    drawer.style.display = _isOpen ? 'flex' : 'none';
    if (_isOpen) {
      updateStatusBadge();
      const input = document.getElementById('geminiChatInput');
      if (input) input.focus();
    }
  }

  /**
   * Toggle inline API Key config box
   */
  function toggleApiKeyInput() {
    const box = document.getElementById('geminiKeyBox');
    if (box) {
      box.style.display = (box.style.display === 'none') ? 'block' : 'none';
    }
  }

  /**
   * Save API Key from inline input
   */
  function saveKeyFromInput() {
    const input = document.getElementById('geminiApiKeyInput');
    const statusMsg = document.getElementById('geminiKeyStatusMsg');
    if (!input) return;
    const val = input.value ? input.value.trim() : '';

    if (val) {
      saveApiKey(val);
      if (statusMsg) {
        statusMsg.style.color = '#10b981';
        statusMsg.textContent = '✓ Gemini API Key saved successfully!';
        setTimeout(() => {
          statusMsg.textContent = '';
          toggleApiKeyInput();
        }, 1200);
      }
    } else {
      saveApiKey('');
      if (statusMsg) {
        statusMsg.style.color = '#ef4444';
        statusMsg.textContent = 'Key cleared.';
      }
    }
  }

  /**
   * Submit message from text area
   */
  function submitMessage() {
    const textarea = document.getElementById('geminiChatInput');
    if (!textarea) return;
    const text = textarea.value ? textarea.value.trim() : '';
    if (!text || _isGenerating) return;

    textarea.value = '';
    sendPrompt(text);
  }

  /**
   * Send user prompt and render AI response
   */
  async function sendPrompt(userText) {
    if (!userText || _isGenerating) return;

    const chatBody = document.getElementById('geminiChatBody');
    const sendBtn = document.getElementById('btnGeminiSend');

    // Make sure drawer is open
    if (!_isOpen) toggleChat();

    // 1. Append User Message
    appendMessage('user', userText);
    _chatHistory.push({ role: 'user', content: userText });

    // 2. Append Loading Placeholder
    _isGenerating = true;
    if (sendBtn) sendBtn.disabled = true;

    const loadingId = 'geminiLoading_' + Date.now();
    const loadingElem = document.createElement('div');
    loadingElem.id = loadingId;
    loadingElem.className = 'gemini-msg assistant';
    loadingElem.innerHTML = `
      <div class="gemini-msg-bubble">
        <span style="color: var(--accent-primary); font-weight: 700;">✨ Gemini AI is analyzing CSV traffic dataset...</span>
      </div>
    `;
    if (chatBody) {
      chatBody.appendChild(loadingElem);
      chatBody.scrollTop = chatBody.scrollHeight;
    }

    try {
      const responseText = await askGemini(userText);

      // Remove loading element
      const el = document.getElementById(loadingId);
      if (el) el.remove();

      // Append AI Response
      appendMessage('assistant', responseText);
      _chatHistory.push({ role: 'model', content: responseText });
    } catch (err) {
      const el = document.getElementById(loadingId);
      if (el) el.remove();

      let errDisplay = err.message || 'An error occurred while connecting to Gemini AI.';
      if (err.message === 'MISSING_API_KEY') {
        errDisplay = '⚠️ **Gemini API Key Required**\nPlease click ⚙️ Key at the top of this drawer to enter your Google Gemini API key to query your CSV dataset.';
        toggleApiKeyInput();
      } else if (err.message === 'INVALID_API_KEY') {
        errDisplay = '⚠️ **Invalid Gemini API Key**\nThe API key provided was rejected by Google Gemini. Please check ⚙️ Key and enter a valid API key.';
        toggleApiKeyInput();
      }

      appendMessage('assistant', errDisplay);
    } finally {
      _isGenerating = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  /**
   * Append a chat bubble to the UI
   */
  function appendMessage(role, contentText) {
    const chatBody = document.getElementById('geminiChatBody');
    if (!chatBody) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `gemini-msg ${role}`;

    const formattedContent = renderMarkdown(contentText);
    msgDiv.innerHTML = `
      <div class="gemini-msg-bubble">
        ${formattedContent}
      </div>
    `;

    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  /**
   * Clear chat history
   */
  function clearChat() {
    _chatHistory = [];
    const chatBody = document.getElementById('geminiChatBody');
    if (chatBody) {
      chatBody.innerHTML = `
        <div class="gemini-welcome-card">
          <div style="font-weight: 800; font-size: 0.95rem; color: var(--accent-primary); margin-bottom: 0.4rem;">Chat history cleared.</div>
          <div style="font-size: 0.82rem; color: var(--text-primary); line-height: 1.45;">
            Ask any question about your uploaded CSV traffic data below!
          </div>
          <div class="gemini-suggestion-chips">
            <button class="gemini-chip" onclick="FlowGuardGemini.sendPrompt('Summarize the overall uploaded CSV traffic dataset.')">📊 Summarize CSV dataset</button>
            <button class="gemini-chip" onclick="FlowGuardGemini.sendPrompt('Which approach has the highest peak traffic demand and flow ratio?')">🚗 Identify Peak Bottleneck</button>
            <button class="gemini-chip" onclick="FlowGuardGemini.sendPrompt('Provide a breakdown of vehicle types and turning movements.')">📈 Vehicle & Turning Breakdown</button>
          </div>
        </div>
      `;
    }
  }

  // Public API Export
  const FlowGuardGemini = {
    getApiKey,
    saveApiKey,
    buildDatasetContext,
    askGemini,
    toggleChat,
    toggleApiKeyInput,
    saveKeyFromInput,
    sendPrompt,
    submitMessage,
    clearChat,
    updateStatusBadge
  };

  if (typeof window !== 'undefined') {
    window.FlowGuardGemini = FlowGuardGemini;
    document.addEventListener('DOMContentLoaded', () => {
      injectAssistantUI();
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlowGuardGemini;
  }
})();
