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
                // Attempt to parse the error response
                const errorData = await response.json().catch(() => ({
                    error: 'Error generating output file.'
                }));

                // Extract the error message
                const errorMessage = errorData.error || errorData.message || 'Error generating output file.';

                // Optionally include details if available
                const errorDetails = errorData.details ? ` Details: ${errorData.details}` : '';

                // Throw an error with the combined message
                throw new Error(errorMessage + errorDetails);
            }

            this.uiManager.updateProgressMessage('Download will start shortly...');

            const blob = await response.blob();
            this.downloadFile(blob);

            this.uiManager.updateProgressMessage('', false);
        } catch (error) {
            this.uiManager.updateProgressMessage('', false);
            // Optionally, you can log the error or handle it differently
            console.error('Upload error:', error);
            throw error;
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