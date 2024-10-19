import { CspEvaluator } from "csp_evaluator/dist/evaluator.js";
import { CspParser } from "csp_evaluator/dist/parser.js";
import { Severity } from "csp_evaluator/dist/finding";

const viewRuleButton = document.getElementById('viewRuleButton');
const debugOutputArea = document.getElementById('debug-output');

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
async function displayExistingCSP() {

  const existingCSP = await loadExistingCSP();

  let directiveList = document.getElementById('existing-directive-list');

  // Clear list
  directiveList.replaceChildren();

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
        .addEventListener('click', toggleDirectivePanel);

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

function toggleDirectivePanel(event) {

  let directiveContainer = event.target.closest('.directive');
  directiveContainer.classList.toggle('expanded');

}

function toggleSegmented(event) {

  let target = event.target;
  let value = target.value;

  let container = target.closest('.segmented-control');
  updateSegmented(container, value)


}

function updateSegmented(control, selectedValue) {
  control.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
  control.querySelectorAll(`button[value="${selectedValue}"]`).forEach(btn => btn.classList.add('active'));

  let changeEvent = new CustomEvent('change', {
    detail: { value: selectedValue }
  });
  control.dispatchEvent(changeEvent);
}


function displayMode(modeId) {
  let tabContainer = document.getElementById('tabs-mode')

  tabContainer.querySelectorAll('.tab-pane').forEach(tabDiv => {
    tabDiv.classList.remove('active');
  });

  switch (modeId) {
    case 'mode-override':
      tabContainer.querySelectorAll('#tab-override').forEach(elem => elem.classList.add('active'));
      break;

    case 'mode-suggest':
      tabContainer.querySelectorAll('#tab-suggest').forEach(elem => elem.classList.add('active'));
      break;

    default:
      tabContainer.querySelectorAll('#tab-existing').forEach(elem => elem.classList.add('active'));
      break;
  }

}


function onModeSelected(event) {

  let modeId = event.detail.value;
  displayMode(modeId);

}

function loadDetailsForInspectedwindow() {

  const tabId = chrome.devtools.inspectedWindow.tabId;

  console.log(`Reloading tab ${message.url}`)

  displayExistingCSP();


}

function onPageNavigated(message, sender, sendResponse) {
  if (message.tabId === chrome.devtools.inspectedWindow.tabId) {

    if (message.action === 'page-navigation-complete') {



    } else if (message.action === 'page-navigation-start') {
      // clearExistingCSP();
    }
  }
}


async function onContentLoaded() {

  document.querySelectorAll('.directive-toggle').forEach(element => {
    element.addEventListener('click', toggleDirectivePanel);
  });


  document.querySelectorAll('.segmented-control button').forEach(element => {
    element.addEventListener('click', toggleSegmented);
  });

  document.querySelectorAll('.segmented-control').forEach(element => {
    element.addEventListener('change', onModeSelected);
  });

  chrome.runtime.onMessage.addListener(onPageNavigated);
  displayExistingCSP();


}


const DOM_CONTENT_LOADED = 'DOMContentLoaded'

document.addEventListener(DOM_CONTENT_LOADED, onContentLoaded);

