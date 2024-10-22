import { CspParser } from "csp_evaluator/dist/parser.js";
import { Config } from "./config";

export class OverrideMode {
    static EXISTING = 'mode-existing';
    static OVERRIDE = 'mode-override';
    static SUGGEST = 'mode-suggest';

}

export class Rules {

    static async getNextRuleId() {
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        return Math.max(0, ...rules.map((rule) => rule.id)) + 1;
    }

    static async getCurrentTabURL() {
        if (chrome.devtools) {
            const tabId = chrome.devtools.inspectedWindow.tabId;
            const tab = await chrome.tabs.get(tabId);
            return tab.url;
        }
        return document.url;
    }

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
    static async detectOverrideMode() {
        const url = await Rules.getCurrentTabURL();
        const rule = await Rules.getActiveRule(url);

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

    static async installReportingRule() {

        const reportService = await Config.getReportService();
        const reportingCSP = `default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; base-uri 'self'; form-action 'self'; report-uri ${reportService}`;
        
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




    static async clearOverrideRule() {
        const tabURL = await Rules.getCurrentTabURL();
        const rule = await Rules.getActiveRule(tabURL);

        if (rule) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [rule.id]
            });
        }

    }

    static async loadExistingCSP() {
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
      

}