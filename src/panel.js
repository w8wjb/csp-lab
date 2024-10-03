import {CspEvaluator} from "csp_evaluator/dist/evaluator.js";
import {CspParser} from "csp_evaluator/dist/parser.js";

const viewRuleButton = document.getElementById('viewRuleButton');
const debugOutputArea = document.getElementById('debug-output');



async function displayExistingCSP(tabId) {
  
  let tabKey = `${tabId}-existing`;
  debugOutputArea.innerHTML = 'Hello World';

  const result = await chrome.storage.local.get(tabKey);
  
  if (result.hasOwnProperty(tabKey)) {
    let existingCSP = result[tabKey];
    debugOutputArea.innerHTML = existingCSP;

    
    const csp = new CspParser(existingCSP).csp;
    
    console.log(csp.directives);

    console.log(new CspEvaluator(csp).evaluate());

  } else {
    console.log(`Nothing found for ${tabKey}`)
  }
}

async function onContentLoaded() {
  // refresh();

  const tabs = await chrome.tabs.query({ currentWindow: true, active: true });
  const tab = tabs[0];
  
  await displayExistingCSP(tab.id);


}


const DOM_CONTENT_LOADED = 'DOMContentLoaded'

document.addEventListener(DOM_CONTENT_LOADED, onContentLoaded);

