import { Config } from "./config";

async function refresh() {
    if (chrome.declarativeNetRequest) {
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        renderRules(rules);
    }

    if (chrome.storage) {
        document.getElementById('suggest-service').value = await Config.getReportService();
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


function renderRules(rules) {
    const ruleList = document.getElementById('ruleList');

    ruleList.replaceChildren();
    for (const rule of rules) {

        let row = createChild('tr', '', ruleList);

        let cellWebsite = createChild('td', '', row);

        let websiteURL = rule.condition['regexFilter'].replace('^', '');
        let websiteLink = createChild('a', '', cellWebsite);
        websiteLink.href = websiteURL;
        websiteLink.appendChild(document.createTextNode(websiteURL));

        let cellStatus = createChild('td', '', row);
        cellStatus.appendChild(document.createTextNode('OVERRIDE'));

        let cellActions = createChild('td', '', row);
        let btnRemove = createChild('button', 'remove', cellActions);
        createChild('i', 'fa-solid fa-trash-can', btnRemove);
        btnRemove.addEventListener('click', function () {
            removeRule(rule.id);
        })


    }
}

async function removeRule(id) {
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [id]
    });
    refresh();
}

async function onContentLoaded() {
    refresh();
}


const DOM_CONTENT_LOADED = 'DOMContentLoaded'

document.addEventListener(DOM_CONTENT_LOADED, onContentLoaded);