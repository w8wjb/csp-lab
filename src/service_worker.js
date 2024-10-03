chrome.runtime.onInstalled.addListener(async function () {
  // restore the default rule if the extension is installed or updated
  console.log("Installing default rules")
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingRules.map((rule) => rule.id),
    addRules: [
      {
        id: 2,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            {
              header: 'Content-Security-Policy',
              operation: 'set',
              value: "default-src 'self'; img-src *; media-src media1.com media2.com; script-src userscripts.example.com"
            }
          ]
        },
        condition: {
          regexFilter: '^https://www.w8wjb.com',
          // urlFilter: '*',
          resourceTypes: ['main_frame']
        }
      }
    ]
  });


});

async function captureResponseHeaders(details) {
  if (details.frameId === 0 && details.method === 'GET') { // We only care about the main frame

    // const contentTypeHeader = details.responseHeaders.find(header => header.name.toLowerCase() === 'content-type');
    const cspHeader = details.responseHeaders.find(header => header.name.toLowerCase() === 'content-security-policy');
    if (cspHeader) {

      let tabKey = `${details.tabId}-existing`;
      
      console.log(tabKey, 'Content-Security-Policy:', cspHeader.value);
      await chrome.storage.local.set({ [tabKey] : cspHeader.value });
    }
  }
}

async function cleanupTab(tabId) {
  let tabKey = `${tabId}-existing`;
  console.log(`Cleaning up ${tabKey}`);
  await chrome.storage.local.remove([tabKey]);
}

// chrome.webNavigation.onCompleted.addListener((details) => {
//   // Only process if it's the main frame (not iframes, etc.)
//   if (details.frameId === 0) {
//     console.log(`Navigated to ${details.url}`);
//     // Send a message to the DevTools panel to update the content
//     // chrome.runtime.sendMessage({
//     //   action: 'page-navigated',
//     //   tabId: details.tabId,
//     //   url: details.url
//     // });
//   }
// });

chrome.webRequest.onHeadersReceived.addListener(captureResponseHeaders,
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
  ["responseHeaders"] // Needed to access the response headers
);

chrome.tabs.onRemoved.addListener(cleanupTab);

chrome.declarativeNetRequest.setExtensionActionOptions({
  displayActionCountAsBadgeText: true
});
