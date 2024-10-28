import { CspEvaluator } from "csp_evaluator/dist/evaluator.js";
import { CspParser } from "csp_evaluator/dist/parser.js";
import { Severity } from "csp_evaluator/dist/finding";
import { OverrideMode, Rules } from "./rules";
import { Config } from "./config";


/**
 * Display a dialog box to the user
 * @param string message message to display
 * @param string type type of dialog ('warning' or 'error')
 */
function displayDialog(message, type = 'warning') {
  const dialog = document.getElementById('message-box');
  dialog.className = `${type} active`;
  dialog.querySelectorAll('h2').forEach(elem => { elem.innerHTML = message })
}

/**
 * Display a dialog advising the user to reload the page. Includes a link to trigger the reload right from the box
 */
function displayReloadDialog() {
  displayDialog('Please <a href="#">reload page</a> for changes to take effect');

  let reloadFunc = () => {
    chrome.tabs.reload();
  }

  document.querySelectorAll('#message-box a').forEach(a => a.addEventListener('click', reloadFunc));
}

/**
 * Hide the dialog box
 */
function hideDialog() {
  document.getElementById('message-box').classList.remove('active');
}


/**
 * Clear out the box with the analysis of the current CSP
 */
function clearCspAnalysis() {
  let directiveList = document.getElementById('csp-evaluation');

  // Clear list
  directiveList.replaceChildren();
}


/**
 * Perform an analysis of the given string and display it in the appropriate box on screen
 * @param string cspString CSP to analyze
 */
async function displayCspAnalysis(cspString) {

  clearCspAnalysis();

  let directiveList = document.getElementById('csp-evaluation');

  if (cspString) {
    const csp = new CspParser(cspString).csp;

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

/**
 * Fetch and display the CSP that was sent by the remote server
 */
async function displayExistingCSP() {

  const existingCSP = await Rules.loadExistingCSP();
  displayCspAnalysis(existingCSP);

}

/**
 * Formats the CSP to better display in a textarea by adding newlines after each directive type
 * @param string cspText 
 * @returns 
 */
function formatCSP(cspText) {
  return cspText.replaceAll('; ', ";\n");
}

/**
 * Fetch the suggested CSP from the service and display it in the box
 */
async function displaySuggestedCSP() {

  const tabURL = await Rules.getCurrentTabURL();
  const rule = await Rules.getActiveRule(tabURL);

  if (rule) {

    const cspHeader = rule.action.responseHeaders[0].value;
    const csp = new CspParser(cspHeader).csp;

    let reportURI = await Config.getSuggestService();
    if ('report-uri' in csp.directives) {
      reportURI = csp.directives['report-uri'][0]
    }

    const suggestedCSP = document.getElementById('suggested-csp');

    clearCspAnalysis();
    suggestedCSP.value = '';
    suggestedCSP.disabled = true;
    document.querySelectorAll('.suggested-csp-actions button').forEach(btn => btn.disabled = true);

    try {
      const response = await fetch(reportURI, {
        headers: {
          'X-Origin': tabURL
        }
      });

      if (response.ok) {
        let cspText = await response.text();
        suggestedCSP.value = formatCSP(cspText);
        suggestedCSP.disabled = false;

        displayCspAnalysis(cspText);
        document.querySelectorAll('.suggested-csp-actions button').forEach(btn => btn.disabled = false);

      } else {
        displayDialog(`CSP Suggestion service unavailable: ${reportURI}`, 'error');
      }

    } catch {
      displayDialog(`CSP Suggestion service unavailable: ${reportURI}`, 'error');
    }


  }

}

/**
 * Ask the the CSP Suggest service to forget what it has captured for the current domain.
 */
async function resetSuggestedCSP() {

  clearCspAnalysis();
  const suggestedCSP = document.getElementById('suggested-csp');

  const tabURL = await Rules.getCurrentTabURL();
  const rule = await Rules.getActiveRule(tabURL);
  

  if (rule) {

    const cspHeader = rule.action.responseHeaders[0].value;
    const csp = new CspParser(cspHeader).csp;

    let reportURI = await Config.getSuggestService();
    if ('report-uri' in csp.directives) {
      reportURI = csp.directives['report-uri'][0]
    }
    

    try {
      const response = await fetch(reportURI, {
        method: 'DELETE',
        headers: {
          'X-Origin': tabURL
        }
      });
      suggestedCSP.value = ''
      displayReloadDialog();

    } catch {
      displayDialog(`CSP Suggestion service unavailable: ${reportURI}`, 'error');
    }

  }

}

/**
 * Fetch the CSP that this extension has installed as an override for the current domain
 */
async function displayOverrideCSP() {

  const tabURL = await Rules.getCurrentTabURL();
  const rule = await Rules.getActiveRule(tabURL);

  if (rule) {
    let cspText = rule.action.responseHeaders[0].value;
    document.getElementById('override-csp').value = formatCSP(cspText);

    displayCspAnalysis(cspText);
  }

}

/**
 * Install a new CSP override with the contents of the textarea
 */
async function updateOverrideCSP() {
  const overrideCSP = document.getElementById('override-csp');
  const cspText = overrideCSP.value;
  await Rules.installOverrideRule(cspText);
  displayReloadDialog();
  displayCspAnalysis(cspText);
}


/**
 * Switch the page to display the content for the speciried mode
 * @param OverrideMode mode 
 */
function displayMode(mode) {

  const modeSelector = document.getElementById('mode-selector');
  modeSelector.setAttribute('value', mode);

  let tabContainer = document.getElementById('tabs-mode')
  tabContainer.querySelectorAll('.tab-pane').forEach(tabDiv => {
    tabDiv.classList.remove('active');
  });

  let paneId = '#' + mode.replace('mode-', 'tab-');
  tabContainer.querySelector(paneId).classList.add('active');


  switch (mode) {
    case OverrideMode.OVERRIDE:
      displayOverrideCSP();
      break;

    case OverrideMode.SUGGEST:
      displaySuggestedCSP();
      break;

    default:
      displayExistingCSP();
      break;
  }

}

/**
 * Load and display the current page's CSP details, depending on the active mode
 */
async function loadDetailsForInspectedwindow() {
  
  const url = await Rules.getCurrentTabURL();
  const rule = await Rules.getActiveRule(url);

  let mode = await Rules.detectOverrideMode(rule);
  hideDialog();
  displayMode(mode);

}

/** Handles page navigation messages */
function onPageNavigated(message, sender, sendResponse) {
  if (message.tabId === chrome.devtools.inspectedWindow.tabId) {

    if (message.action === 'page-navigation-start') {
      clearCspAnalysis();

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
async function onModeSelected(event) {
  const newMode = event.detail.value;
  const oldMode = event.detail.oldValue;


  switch (oldMode) {
    case OverrideMode.OVERRIDE:
      await Rules.clearOverrideRule();
      break;

    case OverrideMode.SUGGEST:
      await Rules.clearOverrideRule();
      break;

    default:
      break;
  }

  switch (newMode) {
    case OverrideMode.OVERRIDE:

      let existingCSP = await Rules.loadExistingCSP();
      if (existingCSP) {
        await Rules.installOverrideRule(existingCSP);
      } else {
        displayReloadDialog();
        await Rules.installOverrideRule(null);
      }

      break;

    case OverrideMode.SUGGEST:
      await Rules.installReportingRule();
      displayReloadDialog();
      break;

    default:
      displayReloadDialog();
      break;
  }


  displayMode(newMode);

}

/**
 * Click handler to apply the suggested CSP as the new CSP override
 * @param Event event 
 */
async function onClickApplySuggestedCSP(event) {

  let suggestedCSP = document.getElementById('suggested-csp').value;
  if (suggestedCSP) {
    await Rules.installOverrideRule(suggestedCSP);
  }

  loadDetailsForInspectedwindow();
  displayReloadDialog();
}

/**
 * Click handler that asks the the CSP Suggest service to forget what it has captured for the current domain.
 * @param Event event 
 */
async function onClickResetSuggestedCSP(event) {
  await resetSuggestedCSP();
}

/**
 * Click handler for updating the override CSP
 * @param Event event 
 */
async function onClickUpdateOverrideCSP(event) {
  await updateOverrideCSP();
}

/** Handles when the page content finished loading */
async function onContentLoaded() {

  document.querySelectorAll('.directive-toggle').forEach(element => {
    element.addEventListener('click', onToggleDirectivePanelClick);
  });

  document.getElementById('mode-selector').addEventListener('change', onModeSelected);
  document.getElementById('btn-udpate-custom-csp').addEventListener('click', onClickUpdateOverrideCSP);
  document.getElementById('btn-apply-suggested-csp').addEventListener('click', onClickApplySuggestedCSP);
  document.getElementById('btn-reset-suggested-csp').addEventListener('click', onClickResetSuggestedCSP);
  

  if (chrome.runtime) {
    chrome.runtime.onMessage.addListener(onPageNavigated);
  }

  loadDetailsForInspectedwindow();

}

/****** End UI Event handlers *******/

const DOM_CONTENT_LOADED = 'DOMContentLoaded'
document.addEventListener(DOM_CONTENT_LOADED, onContentLoaded);

