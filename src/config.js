
const DEFAULT_CSP_REPORT_SERVICE = 'http://localhost:18282/csp-report';
const DEFAULT_STARTER_CSP = "default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self';base-uri 'self';form-action 'self'";

export class Config {

    /**
     * Initilize the default config settings for the extension
     */
    static initDefaults() {

        chrome.storage.sync.set({
            suggestService: DEFAULT_CSP_REPORT_SERVICE,
            starterCSP: DEFAULT_STARTER_CSP
        });

    }

    /**
     * Get the URL to use for the CSP Suggest service
     * @returns string URL
     */
    static async getSuggestService() {
        let { suggestService } = await chrome.storage.sync.get(['suggestService']);
        return suggestService;
    }

    /**
     * Set the URL to use for the CSP Suggest service
     * @param string value 
     */
    static async setSuggestService(value) {
        await chrome.storage.sync.set({ suggestService: value });
    }

    /**
     * Gets an initial set of starter CSP as a baseline override for sites that have no existing policy
     */
    static async getStarterCSP() {
        let { starterCSP } = await chrome.storage.sync.get(['starterCSP']);
        return starterCSP;
    }

}