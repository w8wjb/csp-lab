
const DEFAULT_CSP_REPORT_SERVICE = 'http://localhost:18282/csp-report';
const DEFAULT_STARTER_CSP = "default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self';base-uri 'self';form-action 'self'";

export class Config {

    static initDefaults() {

        chrome.storage.sync.set({
            reportService: DEFAULT_CSP_REPORT_SERVICE,
            starterCSP: DEFAULT_STARTER_CSP
        });

    }

    static async getReportService() {
        let { reportService } = await chrome.storage.sync.get(['reportService']);
        return reportService;
    }

    static async setReportService(value) {
        await chrome.storage.sync.set({ reportService: value });
    }

    static async getStarterCSP() {
        let { starterCSP } = await chrome.storage.sync.get(['starterCSP']);
        return starterCSP;
    }

}