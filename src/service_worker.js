import { Config } from "./config";

chrome.runtime.onInstalled.addListener(async function () {

  Config.initDefaults();


});

async function captureResponseHeaders(details) {
  if (details.frameId === 0 && details.method === 'GET') { // We only care about the main frame

    // const contentTypeHeader = details.responseHeaders.find(header => header.name.toLowerCase() === 'content-type');
    const cspHeader = details.responseHeaders.find(header => header.name.toLowerCase() === 'content-security-policy');
    if (cspHeader) {

      let tabKey = `${details.tabId}-existing`;

      console.log(tabKey, 'Content-Security-Policy:', cspHeader.value);
      await chrome.storage.local.set({ [tabKey]: cspHeader.value });

    } else {
      console.log(`Clearing CSP for ${details.tabId}`);
      cleanupTab(details.tabId);
    }
  }
}

async function cleanupTab(tabId) {
  let tabKey = `${tabId}-existing`;
  console.log(`Cleaning up ${tabKey}`);
  await chrome.storage.local.remove([tabKey]);
}

function sendMessageToDevPanel(message) {
  chrome.runtime.sendMessage(message)
    .catch(e => {
      // Errors can be ignored here. It's almost certainly because the DevTools panel isn't open
    });
}

async function onNavigationStarting(details) {
  // Only process if it's the main frame (not iframes, etc.)
  if (details.frameId !== 0) {
    return;
  }

  console.log("About to navigate; clearing CSP " + details.tabId);
  await cleanupTab(details.tabId);

  let message = {
    action: 'page-navigation-start',
    tabId: details.tabId,
    url: details.url
  };

  sendMessageToDevPanel(message);
}


function onNavigationCompleted(details) {
  // Only process if it's the main frame (not iframes, etc.)
  if (details.frameId !== 0) {
    return;
  }
  // Send a message to the DevTools panel to update the content

  let message = {
    action: 'page-navigation-complete',
    tabId: details.tabId,
    url: details.url
  };

  sendMessageToDevPanel(message);
}




chrome.webNavigation.onBeforeNavigate.addListener(onNavigationStarting);
chrome.webNavigation.onCompleted.addListener(onNavigationCompleted);

chrome.webRequest.onHeadersReceived.addListener(captureResponseHeaders,
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
  ["responseHeaders"] // Needed to access the response headers
);

chrome.tabs.onRemoved.addListener(cleanupTab);

chrome.declarativeNetRequest.setExtensionActionOptions({
  displayActionCountAsBadgeText: true
});
