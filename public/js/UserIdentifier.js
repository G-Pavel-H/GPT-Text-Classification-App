export class UserIdentifier {
    constructor() {
        this.fingerprintData = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            colorDepth: screen.colorDepth,
            screenResolution: `${screen.width},${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            sessionStorage: !!window.sessionStorage,
            localStorage: !!window.localStorage,
            platform: navigator.platform
        };
    }

    async generateFingerprint() {
        const values = Object.values(this.fingerprintData).join('');
        const msgBuffer = new TextEncoder().encode(values);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async getUserId() {
        let userId = localStorage.getItem('user_identifier');
        if (!userId) {
            userId = await this.generateFingerprint();
            localStorage.setItem('user_identifier', userId);
        }
        return userId;
    }
}
