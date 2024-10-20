import { CspEvaluator } from "csp_evaluator/dist/evaluator.js";
import { CspParser } from "csp_evaluator/dist/parser.js";
import { Severity } from "csp_evaluator/dist/finding";
import { SegmentedControl } from "./segmented";

window.customElements.define('segmented-control', SegmentedControl);

export const DEFAULT_CSP_REPORT_SERVICE = 'http://localhost:18282/csp-report';
const DEFAULT_STARTER_CSP = "default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self';base-uri 'self';form-action 'self'";

class OverrideMode {
  static EXISTING = 'mode-existing';
  static OVERRIDE = 'mode-override';
  static SUGGEST = 'mode-suggest';

}

async function getNextRuleId() {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  return Math.max(0, ...rules.map((rule) => rule.id)) + 1;
}

async function getCurrentTabURL() {
  if (chrome.devtools) {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    const tab = await chrome.tabs.get(tabId);
    return tab.url;
  }
  return document.url;
}

async function getActiveRule(url) {
  if (chrome.declarativeNetRequest) {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    for (let rule of rules) {
      const ruleRegex = new RegExp(rule.condition.regexFilter);
      if (ruleRegex.test(url)) {
        return rule;
      }
    }
  }
  return null;
}

/**
 * 
 * @returns Detects whether there is a CSP override in place
 */
async function detectOverrideMode() {
  const url = await getCurrentTabURL();
  const rule = await getActiveRule(url);

  if (rule) {
    const cspHeader = rule.action.responseHeaders[0].header;
    if ("Content-Security-Policy-Report-Only" === cspHeader) {
      return OverrideMode.SUGGEST;
    } else if ("Content-Security-Policy" === cspHeader) {
      return OverrideMode.OVERRIDE;
    }
  }

  return OverrideMode.EXISTING;
}

function displayDialog(message) {
  const dialog = document.getElementById('overlay-dialog');
  dialog.querySelectorAll('h2').forEach(elem => { elem.textContent = message })
  dialog.classList.add('active');
}

function hideDialog() {
  document.getElementById('overlay-dialog').classList.remove('active');
}

async function loadExistingCSP() {
  if (chrome.tabs) {

    const tabId = chrome.devtools.inspectedWindow.tabId
    let tabKey = `${tabId}-existing`;
    const result = await chrome.storage.local.get(tabKey);

    if (result.hasOwnProperty(tabKey)) {
      return result[tabKey];
    }
    return '';

  } else {
    return `default-src https: wss://*.hotjar.com https://*.paradox.ai;
connect-src 'self' blob: data: *.google.com https://*.googleapis.com https://*.gstatic.com https://bam.nr-data.net https://www.google-analytics.com stats.g.doubleclick.net https://global.ketchcdn.com https://googleads.g.doubleclick.net https://*.paradox.ai;
font-src 'unsafe-inline' data: https: https://fonts.gstatic.com;
frame-ancestors 'self' gfs.phenompeople.com cdn-bot.phenompeople.com;
frame-src 'self' *.google.com https://*.gordonnow.gfs.com gfs.phenompeople.com cdn-bot.phenompeople.com youtube.com www.youtube.com https://*.cookiebot.com https://td.doubleclick.net;
img-src 'self' 'unsafe-inline' data: https: *.google.com https://*.googleapis.com *.googleusercontent.com https://*.gstatic.com;
object-src 'none';
script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https: https://*.ggpht.com *.google.com https://*.googleapis.com *.googleusercontent.com https://*.gstatic.com gfs.phenompeople.com cdn-bot.phenompeople.com https://*.gordonnow.gfs.com;
style-src 'self' 'unsafe-inline' https: https://fonts.googleapis.com;
upgrade-insecure-requests;
worker-src 'self' blob:;`;
  }
}


function clearExistingCSP() {
  let directiveList = document.getElementById('existing-directive-list');

  // Clear list
  directiveList.replaceChildren();
}

async function displayExistingCSP() {

  clearExistingCSP();

  const existingCSP = await loadExistingCSP();

  let directiveList = document.getElementById('existing-directive-list');

  if (existingCSP) {
    const csp = new CspParser(existingCSP).csp;

    const findings = new CspEvaluator(csp).evaluate();
    const directiveNames = Object.keys(csp.directives);

    for (let directiveName of directiveNames) {

      // Clone the directive template
      const directiveTemplate = document.getElementById('directiveTemplate');
      const directiveClone = document.importNode(directiveTemplate.content, true);


      directiveClone
        .querySelector('.directive-toggle')
        .addEventListener('click', onToggleDirectivePanelClick);

      // Fill in the directive name
      directiveClone
        .querySelector('.directive-label')
        .textContent = directiveName;

      let overallSeverity = Severity.NONE;

      // Get directive values
      const directiveValues = csp.directives[directiveName];
      const tableDirectiveValues = directiveClone.querySelector('table');

      for (let directiveValue of directiveValues) {
        // Clone the directive value template
        const directiveValueTemplate = document.getElementById('directiveValueTemplate');
        const valueClone = document.importNode(directiveValueTemplate.content, true);

        // Fill in the directive value
        valueClone
          .querySelector('.directive-code')
          .textContent = directiveValue;

        const cellComments = valueClone.querySelector('.comments');

        // Check findings and add comments
        for (let finding of findings) {
          if (finding.directive === directiveName && finding.value === directiveValue) {
            cellComments.textContent = finding.description;
            valueClone.querySelector('tr').classList.add('severity-' + finding.severity);
            overallSeverity = Math.min(overallSeverity, finding.severity);
          }
        }

        // Append the row to the table
        tableDirectiveValues.appendChild(valueClone);
      }

      // Add severity class to the directive name
      directiveClone.querySelector('.directive-name').classList.add('severity-' + overallSeverity);

      // Append the directive to the directive list
      directiveList.appendChild(directiveClone);
    }

  } else {
    // Clone the empty message template
    const emptyMessageTemplate = document.getElementById('emptyMessageTemplate');
    const emptyClone = document.importNode(emptyMessageTemplate.content, true);
    directiveList.replaceChildren(emptyClone);
  }
}

async function displaySuggestedCSP() {

  const tabURL = await getCurrentTabURL();
  const rule = await getActiveRule(tabURL);

  if (rule) {

    const cspHeader = rule.action.responseHeaders[0].value;
    const csp = new CspParser(cspHeader).csp;

    const reportURI = csp.directives['report-uri'][0]

    document.getElementById('suggest-service').value = reportURI;

    const suggestURL = new URL(reportURI);
    const suggestHost = new URL(tabURL).host;

    suggestURL.pathname = `/suggest/${suggestHost}`;

    const response = await fetch(suggestURL);
    if (response.ok) {
      let cspText = await response.text();
      cspText = cspText.replaceAll('; ', ";\n");
      document.getElementById('suggested-csp').value = cspText;
    }

  }

}

async function displayOverrideCSP() {

  const tabURL = await getCurrentTabURL();
  const rule = await getActiveRule(tabURL);

  if (rule) {
    let cspText = rule.action.responseHeaders[0].value;
    cspText = cspText.replaceAll('; ', ";\n");
    document.getElementById('override-csp').value = cspText;
  }

}

async function installReportingRule() {
  const tabURL = await getCurrentTabURL();

  let reportingCSP = await loadExistingCSP();

  if (reportingCSP) {
    const parsed = new CspParser(reportingCSP).csp;
    parsed['report-uri'] = [DEFAULT_CSP_REPORT_SERVICE];
    reportingCSP = parsed.convertToString();

  } else {
    reportingCSP = `default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self';base-uri 'self';form-action 'self'; report-uri ${DEFAULT_CSP_REPORT_SERVICE}`;
  }

  const newRuleID = await getNextRuleId();

  const url = new URL(tabURL);

  const regexFilter = `^${url.protocol}//${url.host}`

  let ruleChanges = {
    addRules: [
      {
        id: newRuleID,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            {
              header: 'Content-Security-Policy-Report-Only',
              operation: 'set',
              value: reportingCSP
            }
          ]
        },
        condition: {
          regexFilter: regexFilter,
          resourceTypes: ['main_frame']
        }
      }
    ]
  }

  const rule = await getActiveRule(tabURL);
  if (rule) {
    ruleChanges['removeRuleIds'] = [rule.id];
  }

  await chrome.declarativeNetRequest.updateDynamicRules(ruleChanges);

}

async function installOverrideRule(newCSP) {

  const tabURL = await getCurrentTabURL();

  let overrideCSP = await loadExistingCSP();
  
  if (newCSP) {
    overrideCSP = newCSP;
  } else if (!overrideCSP) {
    overrideCSP = DEFAULT_STARTER_CSP;
  }

  const newRuleID = await getNextRuleId();

  const url = new URL(tabURL);
  const regexFilter = `^${url.protocol}//${url.host}`

  let ruleChanges = {
    addRules: [
      {
        id: newRuleID,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            {
              header: 'Content-Security-Policy',
              operation: 'set',
              value: overrideCSP
            }
          ]
        },
        condition: {
          regexFilter: regexFilter,
          resourceTypes: ['main_frame']
        }
      }
    ]
  }

  const rule = await getActiveRule(tabURL);
  if (rule) {
    ruleChanges['removeRuleIds'] = [rule.id];
  }

  await chrome.declarativeNetRequest.updateDynamicRules(ruleChanges);


}

async function clearOverrideRule() {
  const tabURL = await getCurrentTabURL();
  const rule = await getActiveRule(tabURL);

  if (rule) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [rule.id]
    });
  }

}

function displayMode(mode) {

  const modeSelector = document.getElementById('mode-selector');
  modeSelector.setAttribute('value', mode);

  let tabContainer = document.getElementById('tabs-mode')
  tabContainer.querySelectorAll('.tab-pane').forEach(tabDiv => {
    tabDiv.classList.remove('active');
  });

  let paneId = '#' + mode.replace('mode-', 'tab-');
  tabContainer.querySelector(paneId).classList.add('active');

}

async function loadDetailsForInspectedwindow() {

  let mode = await detectOverrideMode();
  hideDialog();
  displayMode(mode);

  switch (mode) {
    case OverrideMode.OVERRIDE:
      displayOverrideCSP();

    case OverrideMode.SUGGEST:
      displaySuggestedCSP();

    default:
      displayExistingCSP();
  }

}

/** Handles page navigation messages */
function onPageNavigated(message, sender, sendResponse) {
  if (message.tabId === chrome.devtools.inspectedWindow.tabId) {

    if (message.action === 'page-navigation-start') {
      clearExistingCSP();

    } else if (message.action === 'page-navigation-complete') {
      loadDetailsForInspectedwindow();

    }
  }
}

/****** Begin UI Event handlers *******/


/**  Handles clicks to togggle directives open and closed */
function onToggleDirectivePanelClick(event) {

  let directiveContainer = event.target.closest('.directive');
  directiveContainer.classList.toggle('expanded');

}

/** Handles change events emitted by the segmented control */
function onModeSelected(event) {
  const newMode = event.detail.value;
  const oldMode = event.detail.oldValue;


  switch (oldMode) {
    case OverrideMode.OVERRIDE:
      clearOverrideRule();
      break;

    case OverrideMode.SUGGEST:
      clearOverrideRule();
      break;

    default:
      break;
  }

  switch (newMode) {
    case OverrideMode.OVERRIDE:
      installOverrideRule(null);
      displayDialog("Please reload page for changes to take effect");
      break;

    case OverrideMode.SUGGEST:
      installReportingRule();
      displayDialog("Please reload page for changes to take effect");
      break;

    default:
      hideDialog();
      break;
  }


  displayMode(newMode);

}

async function onClickApplySuggestedCSP(event) {
  
  let suggestedCSP = document.getElementById('suggested-csp').value;
  if (suggestedCSP) {
    suggestedCSP = suggestedCSP.replaceAll("\n", " ");
    await installOverrideRule(suggestedCSP);
  }

  loadDetailsForInspectedwindow();
  displayDialog("Please reload page for changes to take effect");
}

/** Handles when the page content finished loading */
async function onContentLoaded() {
  console.log('HERE');

  document.querySelectorAll('.directive-toggle').forEach(element => {
    element.addEventListener('click', onToggleDirectivePanelClick);
  });

  document.getElementById('mode-selector').addEventListener('change', onModeSelected);
  document.getElementById('btn-apply-suggested-csp').addEventListener('click', onClickApplySuggestedCSP);

  if (chrome.runtime) {
    chrome.runtime.onMessage.addListener(onPageNavigated);
  }

  loadDetailsForInspectedwindow();

}

/****** End UI Event handlers *******/

const DOM_CONTENT_LOADED = 'DOMContentLoaded'
document.addEventListener(DOM_CONTENT_LOADED, onContentLoaded);

