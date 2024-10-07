document.addEventListener('DOMContentLoaded', function() {
    // Interactive Background Mouse Move Event
    document.addEventListener('mousemove', function(e) {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        document.body.style.setProperty('--mouse-x', x + '%');
        document.body.style.setProperty('--mouse-y', y + '%');
    });

// script.js

// Updated addLabel function
function addLabel() {
    const container = document.getElementById('labels-container');
    const labels = container.querySelectorAll('.label');

    // If there is only one label and it doesn't have a delete button, add it
    if (labels.length === 1) {
        const firstLabel = labels[0];
        if (!firstLabel.querySelector('.remove-label')) {
            const deleteButton = document.createElement('button');
            deleteButton.className = 'remove-label';
            deleteButton.textContent = '×';
            deleteButton.onclick = function() { removeLabel(this); };
            firstLabel.appendChild(deleteButton);
        }
    }

    // Create new label
    const newLabel = document.createElement('div');
    newLabel.classList.add('label');

    newLabel.innerHTML = `
        <input type="text" placeholder="Category Name" class="label-name">
        <input type="text" placeholder="Category Definition" class="label-definition">
    `;

    // Append delete button to new label
    const deleteButton = document.createElement('button');
    deleteButton.className = 'remove-label';
    deleteButton.textContent = '×';
    deleteButton.onclick = function() { removeLabel(this); };
    newLabel.appendChild(deleteButton);

    container.appendChild(newLabel);
}

// Updated removeLabel function
function removeLabel(button) {
    const container = document.getElementById('labels-container');
    const label = button.parentElement;
    container.removeChild(label);

    const labels = container.querySelectorAll('.label');
    if (labels.length === 1) {
        // Remove delete button from the remaining label
        const remainingLabel = labels[0];
        const deleteButton = remainingLabel.querySelector('.remove-label');
        if (deleteButton) {
            remainingLabel.removeChild(deleteButton);
        }
    }
}
    // Function to upload the CSV file and send label definitions
    async function uploadFile() {
        const fileInput = document.getElementById('csvFileInput');
        const file = fileInput.files[0];

        if (!file) {
            alert('Please upload a CSV file.');
            return;
        }

        const labelElements = document.querySelectorAll('.label');
        if (labelElements.length === 0) {
            alert('Please add at least one category.');
            return;
        }

        const labels = Array.from(labelElements).map(labelElement => {
            const nameInput = labelElement.querySelector('.label-name');
            const definitionInput = labelElement.querySelector('.label-definition');

            if (!nameInput || !definitionInput) {
                console.error('Missing input elements in label:', labelElement);
                return null;
            }

            return {
                name: nameInput.value.trim(),
                definition: definitionInput.value.trim()
            };
        }).filter(label => label !== null);

        if (labels.some(label => label.name === '' || label.definition === '')) {
            alert('Please fill in all category names and definitions.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('labels', JSON.stringify(labels));

        // Show progress message
        const progressMessage = document.getElementById('progress-message');
        progressMessage.style.display = 'block';
        progressMessage.textContent = 'Processing your file, please wait...';

        try {
            const response = await fetch('/upload-csv', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                // Update progress message
                progressMessage.textContent = 'Download will start shortly...';

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'categorized-output.csv';
                document.body.appendChild(a);
                a.click();
                a.remove();

                // Hide progress message
                progressMessage.style.display = 'none';
            } else {
                alert('Error generating output file.');
                progressMessage.style.display = 'none';
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred while processing the file.');
            progressMessage.style.display = 'none';
        }
    }

    // Custom file input label
    const realFileBtn = document.getElementById('csvFileInput');
    const customBtn = document.getElementById('custom-file-upload');

    // Remove the click event listener
    // customBtn.addEventListener('click', function() {
    //     realFileBtn.click();
    // });

    realFileBtn.addEventListener('change', function() {
        if (realFileBtn.files && realFileBtn.files[0]) {
            customBtn.textContent = realFileBtn.files[0].name;
        } else {
            customBtn.textContent = 'Choose File';
        }
    });

    // Expose functions to global scope
    window.addLabel = addLabel;
    window.uploadFile = uploadFile;
    window.removeLabel = removeLabel;

    
});