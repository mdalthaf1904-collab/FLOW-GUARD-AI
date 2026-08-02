/**
 * FlowGuard AI - Localization (i18n) System
 * Supports English (en) and Telugu (te)
 */

const I18n = (function() {
  'use strict';

  const translations = {
    'en': {
      'dashboard_title': 'Traffic Analytics & Performance Dashboard',
      'dashboard_subtitle': 'Offline analysis results, simulation metrics, time-of-day profiles, and prototype signal recommendations.',
      'offline_prototype': 'OFFLINE PROTOTYPE',
      'upload_data': 'Ingest Historical Traffic Data (CSV)',
      'upload_desc': 'Upload a CSV file containing: Time, Vehicles_Per_Minute, Lanes, and Incident.',
      'process_data': 'Process Data',
      'green_split_adjustment': 'Manual Green Split Override (Seconds)',
      'green_split_desc': 'Adjust the slider to instantly re-calculate D/D/1 queuing metrics and preview timing phases.',
      'candidate_green_split': 'Candidate Green Split:',
      'bottleneck_detected': 'Bottleneck Detected',
      'run_simulation': 'Run Simulation',
      'simulation_results': 'Simulation Results: Before vs. After',
      'nav_home': 'Home',
      'nav_analysis': 'Analysis',
      'nav_simulation': 'Simulation',
      'nav_dashboard': 'Dashboard',
      'nav_controller': 'Controller',
      'nav_validation': 'Validation',
      'active_intersection': 'ACTIVE INTERSECTION GEOMETRY',
      'active_approaches': 'Active Approaches:',
      'inactive_approaches': 'Inactive:',
      'change_geometry': 'Change Geometry \u2192'
    },
    'te': {
      'dashboard_title': 'ట్రాఫిక్ ఎనలిటిక్స్ & పనితీరు డాష్‌బోర్డ్',
      'dashboard_subtitle': 'ఆఫ్‌లైన్ విశ్లేషణ ఫలితాలు, అనుకరణ మెట్రిక్‌లు, రోజులో సమయ ప్రొఫైల్‌లు మరియు ప్రోటోటైప్ సిగ్నల్ సిఫార్సులు.',
      'offline_prototype': 'ఆఫ్‌లైన్ ప్రోటోటైప్',
      'upload_data': 'చారిత్రక ట్రాఫిక్ డేటాను అప్‌లోడ్ చేయండి (CSV)',
      'upload_desc': 'సమయం, నిమిషానికి వాహనాలు, లేన్‌లు మరియు సంఘటనలను కలిగి ఉన్న CSV ఫైల్‌ను అప్‌లోడ్ చేయండి.',
      'process_data': 'డేటాను ప్రాసెస్ చేయండి',
      'green_split_adjustment': 'మాన్యువల్ గ్రీన్ స్ప్లిట్ ఓవర్‌రైడ్ (సెకన్లు)',
      'green_split_desc': 'D/D/1 క్యూయింగ్ మెట్రిక్‌లను తక్షణమే మళ్లీ లెక్కించడానికి మరియు టైమింగ్ దశలను ప్రివ్యూ చేయడానికి స్లైడర్‌ను సర్దుబాటు చేయండి.',
      'candidate_green_split': 'అభ్యర్థి గ్రీన్ స్ప్లిట్:',
      'bottleneck_detected': 'అంతరాయం కనుగొనబడింది',
      'run_simulation': 'అనుకరణను అమలు చేయండి',
      'simulation_results': 'అనుకరణ ఫలితాలు: ముందు vs తర్వాత',
      'nav_home': 'హోమ్',
      'nav_analysis': 'విశ్లేషణ',
      'nav_simulation': 'అనుకరణ',
      'nav_dashboard': 'డాష్‌బోర్డ్',
      'nav_controller': 'కంట్రోలర్',
      'nav_validation': 'ధ్రువీకరణ',
      'active_intersection': 'క్రియాశీల కూడలి జ్యామితి',
      'active_approaches': 'క్రియాశీల విధానాలు:',
      'inactive_approaches': 'క్రియారహితంగా:',
      'change_geometry': 'జ్యామితిని మార్చండి \u2192'
    }
  };

  let currentLang = 'en';

  function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[lang][key]) {
        // If element is an input with placeholder, update placeholder
        if (el.tagName === 'INPUT' && el.type !== 'button' && el.type !== 'submit') {
           el.placeholder = translations[lang][key];
        } else {
           // We use textContent for safety, though innerHTML is possible if HTML tags are needed.
           el.textContent = translations[lang][key];
        }
      }
    });

    // Update active state on toggle buttons
    const langBtns = document.querySelectorAll('.lang-toggle-btn');
    langBtns.forEach(btn => {
      if (btn.getAttribute('data-lang') === lang) {
        btn.classList.add('active-lang');
      } else {
        btn.classList.remove('active-lang');
      }
    });
  }

  function getCurrentLanguage() {
    return currentLang;
  }

  // Initialize listener on load
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('lang-toggle-btn')) {
          const lang = e.target.getAttribute('data-lang');
          setLanguage(lang);
        }
      });
    });
  }

  return {
    setLanguage,
    getCurrentLanguage,
    translations
  };
})();

if (typeof window !== 'undefined') { window.I18n = I18n; }
if (typeof module !== 'undefined' && module.exports) { module.exports = I18n; }
