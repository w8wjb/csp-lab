import { Config } from "./config";

export class OverrideMode {
    static EXISTING = 'mode-existing';
    static OVERRIDE = 'mode-override';
    static SUGGEST = 'mode-suggest';

}

export class Rules {

    /**
     * Gets the next available rule ID
     * @returns ID number
     */
    static async getNextRuleId() {
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        return Math.max(0, ...rules.map((rule) => rule.id)) + 1;
    }

    /**
     * Gets the URL that is displayed in the active tab
     * @returns url string
     */
    static async getCurrentTabURL() {
        if (chrome.devtools) {
            const tabId = chrome.devtools.inspectedWindow.tabId;
            const tab = await chrome.tabs.get(tabId);
            return tab.url;
        }
        return document.url;
    }

    /**
     * Gets the override rule for the given URL, if one exists
     * @param string url 
     * @returns 
     */
    static async getActiveRule(url) {
        if (chrome.declarativeNetRequest) {
            if (!url) {
                url = Rules.getCurrentTabURL();
            }

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
    static async detectOverrideMode(rule) {
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

    /**
     * Installs a rule that will override any existing CSP and replace it with a 'Content-Security-Policy-Report-Only' header
     */
    static async installReportingRule() {

        const suggestService = await Config.getSuggestService();
        const reportingCSP = `default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; base-uri 'self'; form-action 'self'; report-uri ${suggestService}`;
        
        const tabURL = await Rules.getCurrentTabURL();
        const url = new URL(tabURL);

        const newRuleID = await Rules.getNextRuleId();
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
                            },
                            {
                                header: 'Content-Security-Policy',
                                operation: 'remove'
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

        const rule = await Rules.getActiveRule(tabURL);
        if (rule) {
            ruleChanges['removeRuleIds'] = [rule.id];
        }

        await chrome.declarativeNetRequest.updateDynamicRules(ruleChanges);

    }

    /**
     * Installs a rule that will override any existing CSP with the specified CSP
     * @param string newCSP 
     */
    static async installOverrideRule(newCSP) {

        const tabURL = await Rules.getCurrentTabURL();

        let overrideCSP = newCSP ?? await Config.getStarterCSP();
        overrideCSP = overrideCSP.replaceAll("\n", " ");

        const newRuleID = await Rules.getNextRuleId();

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

        const rule = await Rules.getActiveRule(tabURL);
        if (rule) {
            ruleChanges['removeRuleIds'] = [rule.id];
        }

        await chrome.declarativeNetRequest.updateDynamicRules(ruleChanges);


    }



    /**
     * Remove any existing rule that performs an CSP override on the current tab's URL
     */
    static async clearOverrideRule() {
        const tabURL = await Rules.getCurrentTabURL();
        const rule = await Rules.getActiveRule(tabURL);

        if (rule) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [rule.id]
            });
        }

    }

    /**
     * @returns string existing CSP, or an empty string if none
     */
    static async loadExistingCSP() {
        if (chrome.tabs) {
      
          const tabId = chrome.devtools.inspectedWindow.tabId
          let tabKey = `${tabId}-existing`;
          const result = await chrome.storage.local.get(tabKey);
      
          if (result.hasOwnProperty(tabKey)) {
            return result[tabKey];
          }
        }
        return '';
      }
      

}