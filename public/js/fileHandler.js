export class FileHandler {
    constructor() {
        this.isValid = false;
        this.selectedFile = null;
    }

    validateFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                const rows = text.split('\n').filter(row => row.trim() !== '');
                const header = rows[0].split(',');
                const inputColumnIndex = header.findIndex(col => 
                    col.trim().toLowerCase() === 'input'
                );
    
                if (inputColumnIndex === -1) {
                    this.isValid = false;
                    this.selectedFile = null;
                    reject(new Error('CSV file must contain a column named "Input".')); // Changed this line
                    return;
                }
                
                this.isValid = true;
                this.selectedFile = file;
                resolve(true);
            };
            reader.readAsText(file);
        });
    }

    reset() {
        this.isValid = false;
        this.selectedFile = null;
    }
}