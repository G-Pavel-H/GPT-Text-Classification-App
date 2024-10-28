document.addEventListener('DOMContentLoaded', function() {
    // Interactive Background Mouse Move Event
    document.addEventListener('mousemove', function(e) {
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        document.body.style.setProperty('--mouse-x', x + '%');
        document.body.style.setProperty('--mouse-y', y + '%');
    });
    addModelChangeListeners(); 
});

let isFileValid = false;
let selectedFile = null;
let maxLabelCount = 8;
let labelMaxLength = 5;

let isPriceValid = false;
let maxAllowedPrice = 0.1;

function validateFile(file){
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        // Parse CSV
        const rows = text.split('\n').filter(row => row.trim() !== '');
        // Assuming the first row is the header
        let inputColumnIndex = -1;
        const header = rows[0].split(',');
        // Find the index of the "Input" column
        for (let i = 0; i < header.length; i++) {
            if (header[i].trim().toLowerCase() === 'input') {
                inputColumnIndex = i;
                break;
            }
        }
        if (inputColumnIndex === -1) {
            customBtn.textContent = 'Choose File';
            showCustomAlert('CSV file must contain a column named "Input".');
            isFileValid = false; // Set the flag to false
            resetPriceEstimate();
            return false;
        }
    }
    reader.readAsText(file);
    isFileValid = true;
    return true;
}

function calculatePrice(file) {

    const model = document.querySelector('input[name="model"]:checked').value;

    // Prepare form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', model);

    // Send the file and model to the backend
    fetch('/calculate-cost', {
        method: 'POST',
        body: formData
    })
    .then(async (response) => {
        if (response.ok) {
            const data = await response.json();
            const totalCost = data.totalCost;

            // Update the price display with animation
            const priceEstimateElement = document.getElementById('price-estimate');
            animateValue(priceEstimateElement, 0, totalCost, 1000); // Animate over 1 second


            if(totalCost > maxAllowedPrice){
                isPriceValid = false;
                showCustomAlert("File is too large, exceeded price limit of $"+maxAllowedPrice+". Please upload a different, smaller file");
                resetPriceEstimate();
            }
            else{
                isPriceValid = true;
            }

        } else {
            showCustomAlert('Error calculating token count.');
            resetPriceEstimate();
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showCustomAlert('An error occurred while calculating token count.');
        resetPriceEstimate();
    });

}

// Helper function to reset price estimate
function resetPriceEstimate() {
    const priceEstimateElement = document.getElementById('price-estimate');
    priceEstimateElement.textContent = '$0.00';
}

// Updated addLabel function
function addLabel() {
    const container = document.getElementById('labels-container');
    const labels = container.querySelectorAll('.label');

    if(labels.length > maxLabelCount){
        showCustomAlert("No more labels can be added, maximum is " + maxLabelCount);
        return;
    }
    
    // If there is only one label and it doesn't have a delete button, add it
    if (labels.length === 2) {
      for (let i = 0; i < labels.length; i++) {
        const firstLabel = labels[i];
        if (!firstLabel.querySelector('.remove-label')) {
            const deleteButton = document.createElement('button');
            deleteButton.className = 'remove-label';
            deleteButton.textContent = '×';
            deleteButton.onclick = function() { removeLabel(this); };
            firstLabel.appendChild(deleteButton);
        }
      }
    }

    // Create new label
    const newLabel = document.createElement('div');
    newLabel.classList.add('label');

    newLabel.innerHTML = `
        <input type="text" placeholder="Label Name" class="label-name" maxlength="${maxLabelCount}">
        <input type="text" placeholder="Label Definition" class="label-definition" maxlength="${maxLabelCount}">
    `;

    // Append delete button to new label
    const deleteButton = document.createElement('button');
    deleteButton.className = 'remove-label';
    deleteButton.textContent = '×';
    deleteButton.onclick = function() { removeLabel(this); };
    newLabel.appendChild(deleteButton);

    container.appendChild(newLabel);
}

// Function to animate the price value
function animateValue(element, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = timestamp - startTimestamp;
        const current = Math.min(start + (end - start) * (progress / duration), end);
        element.textContent = '$' + current.toFixed(4);
        if (progress < duration) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Function to display custom alert
function showCustomAlert(message) {
    const modal = document.getElementById('custom-alert');
    const messageElement = document.getElementById('custom-alert-message');
    const closeBtn = document.querySelector('.custom-alert-close');

    messageElement.textContent = message;
    modal.style.display = 'block';

    closeBtn.onclick = function() {
        modal.style.display = 'none';
    };

    // Close modal when clicking outside of the content
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
}

// Updated removeLabel function
function removeLabel(button) {
    const container = document.getElementById('labels-container');
    const label = button.parentElement;
    container.removeChild(label);

    const labels = container.querySelectorAll('.label');
    if (labels.length === 2) {
        // Remove delete button from the remaining label
        for (let i = 0; i < labels.length; i++) {
          const remainingLabel = labels[i];
          const deleteButton = remainingLabel.querySelector('.remove-label');
          if (deleteButton) {
              remainingLabel.removeChild(deleteButton);
          }
        }
    }
}
// Function to upload the CSV file and send label definitions
async function uploadFile() {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];

    if(!isPriceValid){
        showCustomAlert("File is too large, exceeded price limit of $"+maxAllowedPrice+". Please upload a different, smaller file");
    }

    if (!file) {
        showCustomAlert('Please upload a CSV file.');
        return;
    }

    if (!isFileValid) {
        showCustomAlert('Invalid file. Please upload a valid CSV file.');
        return;
    }

    const labelElements = document.querySelectorAll('.label');
    if (labelElements.length === 0) {
        showCustomAlert('Please add at least one Label.');
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

    if (labels.some(label => label.name === '' || label.definition === '' )) {
        showCustomAlert('Please fill in all Label names and definitions.');
        return;
    }
    if (labels.some(label => label.name.length > labelMaxLength || label.definition.length > labelMaxLength)) {
        showCustomAlert('Label has exeded the limit of characters - '+labelMaxLength+'.');
        return;
    }
    const model = document.querySelector('input[name="model"]:checked').value;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('labels', JSON.stringify(labels));
    formData.append('model', model);

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
            showCustomAlert('Error generating output file.');
            progressMessage.style.display = 'none';
        }
    } catch (error) {
        console.error('Error:', error);
        showCustomAlert('An error occurred while processing the file.');
        progressMessage.style.display = 'none';
    }
}

 // Custom file input label
const realFileBtn = document.getElementById('csvFileInput');
const customBtn = document.getElementById('custom-file-upload');

realFileBtn.addEventListener('change', function() {
    if (realFileBtn.files && realFileBtn.files[0] && validateFile(realFileBtn.files[0])) {
        selectedFile = realFileBtn.files[0]; // Store the selected file
        const file = selectedFile;
        customBtn.textContent = file.name;
        // Call calculatePrice function
        calculatePrice(file);
    } else {
        // Reset price estimate
        resetPriceEstimate();
        isFileValid = false;
        selectedFile = null; // Reset the selected file
    }
});

// Expose functions to global scope
window.addLabel = addLabel;
window.uploadFile = uploadFile;
window.removeLabel = removeLabel;

// Add this function to add event listeners to the model radio buttons
function addModelChangeListeners() {
  const modelRadioButtons = document.querySelectorAll('input[name="model"]');
  modelRadioButtons.forEach(radio => {
      radio.addEventListener('change', function() {
          if (selectedFile && validateFile(selectedFile)) {
              calculatePrice(selectedFile);
          }
      });
  });
}
// Hide preloader after a fixed time or when page is fully loaded
window.addEventListener('load', function() {
    setTimeout(function() {
        const preloader = document.getElementById('preloader');
        preloader.style.opacity = '0';
        preloader.style.transition = 'opacity 1s ease';

        // Remove preloader from DOM after transition
        setTimeout(function() {
            preloader.style.display = 'none';
        }, 1000);
    }, 1000); // Adjust the delay as needed
});