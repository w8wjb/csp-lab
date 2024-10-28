import { Config } from "./config";
import { OverrideMode, Rules } from "./rules";

var ruleRowTemplate = null;

async function refresh() {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    renderRules(rules);

    document.getElementById('suggest-service').value = await Config.getSuggestService();
}

async function renderRules(rules) {
    const ruleList = document.getElementById('ruleList');

    ruleList.replaceChildren();

    for (const rule of rules) {

        let mode = await Rules.detectOverrideMode(rule);

        let websiteURL = rule.condition['regexFilter'].replace('^', '');

        const ruleRow = document.importNode(ruleRowTemplate.content, true);

        ruleRow
            .querySelector('.site')
            .textContent = websiteURL;

        let modeDesc = 'OVERRIDE';
        if (mode == OverrideMode.SUGGEST) {
            modeDesc = 'SUGGEST';
        }

        ruleRow
            .querySelector('.mode')
            .textContent = modeDesc;

        ruleRow
            .querySelector('.remove')
            .addEventListener('click', function () {
                removeRule(rule.id);
            })


        ruleList.appendChild(ruleRow);
    }
}

async function removeRule(id) {
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [id]
    });
    refresh();
}

async function onClickSaveOptions(event) {

    const suggestService = document.getElementById('suggest-service').value
    Config.setSuggestService(suggestService);


}

async function onContentLoaded() {

    ruleRowTemplate = document.getElementById('ruleRowTemplate');
    document.getElementById('save-options').addEventListener('click', onClickSaveOptions);

    refresh();
}


const DOM_CONTENT_LOADED = 'DOMContentLoaded'

document.addEventListener(DOM_CONTENT_LOADED, onContentLoaded);