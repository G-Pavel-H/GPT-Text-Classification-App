// File Uploader Class
export class FileUploader {
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    async uploadFile(file, labels, model) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('labels', JSON.stringify(labels));
        formData.append('model', model);

        this.uiManager.updateProgressMessage('Processing your file, please wait...');

        try {
            const response = await fetch('/upload-csv', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Error generating output file.' }));
                throw new Error(errorData.message || 'Error generating output file.');
            }

            this.uiManager.updateProgressMessage('Download will start shortly...');
            
            const blob = await response.blob();
            this.downloadFile(blob);
            
            this.uiManager.updateProgressMessage('', false);
        } catch (error) {
            this.uiManager.updateProgressMessage('', false);
            throw error; // Re-throw the error to be handled by the caller
        }
    }

    downloadFile(blob) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'categorized-output.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
}