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

function createChild(tagName, className, parent) {
  let child = document.createElement(tagName);
  if (className) {
    child.className = className;
  }
  parent.appendChild(child);
  return child;
}

async function clearExistingCSP() {
  let directiveList = document.getElementById('existing-directive-list');

  // Clear list
  directiveList.replaceChildren();
}

async function displayExistingCSP() {

  const existingCSP = await loadExistingCSP();

  let directiveList = document.getElementById('existing-directive-list');

  clearExistingCSP();

  if (existingCSP) {
    const csp = new CspParser(existingCSP).csp;

    const findings = new CspEvaluator(csp).evaluate();
    console.log(findings);


    const directiveNames = Object.keys(csp.directives);

    for (let directiveName of directiveNames) {

      let divDirective = createChild('div', 'directive', directiveList);

      let divDirectiveName = createChild('div', 'directive-name', divDirective);
      let directiveToggle = createChild('button', 'directive-toggle', divDirectiveName);
      directiveToggle.addEventListener('click', toggleDirectivePanel);

      createChild('i', 'indicator', divDirectiveName);
      divDirectiveName.appendChild(document.createTextNode(' ' + directiveName));

      let divDirectiveValues = createChild('div', 'directive-values', divDirective);
      let tableDirectiveValues = createChild('table', '', divDirectiveValues);

      let overallSeverity = Severity.NONE;

      let directiveValues = csp.directives[directiveName]
      for (let directiveValue of directiveValues) {

        let row = createChild('tr', 'directive-value', tableDirectiveValues);

        let cellIndicator = createChild('td', '', row);
        createChild('i', 'indicator', cellIndicator);

        let cellValue = createChild('td', '', row);
        let codeWrapper = createChild('code', '', cellValue);
        codeWrapper.appendChild(document.createTextNode(directiveValue));

        let cellComments = createChild('td', 'comments', row);


        for (let finding of findings) {
          if (finding.directive === directiveName && finding.value === directiveValue) {
            cellComments.appendChild(document.createTextNode(finding.description))
            row.classList.add('severity-' + finding.severity)

            overallSeverity = Math.min(overallSeverity, finding.severity);
          }
        }
      }

      divDirectiveName.classList.add('severity-' + overallSeverity);

    }



  } else {

    const d1 = document.createElement('div');
    d1.className = 'empty';
    d1.textContent = "This page did not specify a Content Security Policy";
    directiveList.replaceChildren(d1);
  }
}


function toggleDirectivePanel(event) {

  let directiveContainer = event.target.closest('.directive')

  if (directiveContainer.classList.contains('expanded')) {
    directiveContainer.classList.remove('expanded');
  } else {
    directiveContainer.classList.add('expanded');
  }

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

function onPageNavigated(message, sender, sendResponse) {
  if (message.tabId === chrome.devtools.inspectedWindow.tabId) {
    
    if (message.action === 'page-navigation-complete') {
      console.log(`Reloading tab ${message.url}`)
      displayExistingCSP();

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

