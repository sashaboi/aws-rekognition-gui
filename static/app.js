// Global variables
let statusBanner;
let credentialsForm;
let credentialsSection;
let operationsSection;
let logsSection;
let logsContent;

// Status elements
let internetStatus;
let awsStatus;
let apiStatus;

// Health check interval
let healthCheckInterval;

// Status management functions
function updateStatus(element, status, message) {
    if (!element) {
        console.error('Status element not found');
        return;
    }

    element.className = 'status-item';
    element.classList.add(`status-${status}`);

    const icon = element.querySelector('i');
    const text = element.querySelector('span');

    if (!icon || !text) {
        console.error('Status icon or text element not found');
        return;
    }

    switch (status) {
        case 'success':
            icon.className = 'fas fa-check-circle';
            break;
        case 'error':
            icon.className = 'fas fa-exclamation-circle';
            break;
        case 'warning':
            icon.className = 'fas fa-exclamation-triangle';
            break;
        case 'loading':
            icon.className = 'fas fa-sync';
            element.classList.add('loading');
            break;
    }

    text.textContent = message;
}

function updateInternetStatus(isOnline) {
    updateStatus(
        internetStatus,
        isOnline ? 'success' : 'error',
        `Internet: ${isOnline ? 'Connected' : 'Offline'}`
    );
}

function updateAwsStatus(isValid) {
    updateStatus(
        awsStatus,
        isValid ? 'success' : 'error',
        `AWS: ${isValid ? 'Connected' : 'Not Connected'}`
    );
}

function updateApiStatus(status, operation = '') {
    const messages = {
        ready: 'Ready',
        loading: `Processing ${operation}...`,
        success: `${operation} completed`,
        error: `${operation} failed`
    };

    updateStatus(apiStatus, status, messages[status]);

    // Clear success/error messages after 3 seconds
    if (status === 'success' || status === 'error') {
        setTimeout(() => {
            updateStatus(apiStatus, 'ready', messages.ready);
        }, 3000);
    }
}

// Function to load collections for the dropdown
async function loadCollectionsForDropdown() {
    const collectionIdSelect = document.getElementById('collection-id');
    if (!collectionIdSelect) return;
    
    // Save current selection if any
    const currentSelection = collectionIdSelect.value;
    
    // Clear dropdown except for the placeholder
    while (collectionIdSelect.options.length > 1) {
        collectionIdSelect.remove(1);
    }
    
    // Show loading state
    const placeholder = collectionIdSelect.options[0];
    placeholder.text = 'Loading collections...';
    
    try {
        const response = await fetch('/api/collections');
        const data = await response.json();
        
        if (response.ok) {
            // Reset placeholder
            placeholder.text = '-- Select a collection --';
            
            if (data.CollectionIds && data.CollectionIds.length > 0) {
                // Add each collection to the dropdown
                data.CollectionIds.forEach(collectionId => {
                    const option = document.createElement('option');
                    option.value = collectionId;
                    option.text = collectionId;
                    collectionIdSelect.add(option);
                });
                
                logMessage(`Loaded ${data.CollectionIds.length} collections for selection`, 'success');
                
                // Restore previous selection if it exists
                if (currentSelection && data.CollectionIds.includes(currentSelection)) {
                    collectionIdSelect.value = currentSelection;
                }
            } else {
                logMessage('No collections found. Please create a collection in AWS Rekognition first.');
            }
        } else {
            placeholder.text = '-- Error loading collections --';
            throw new Error(data.error || 'Failed to load collections');
        }
    } catch (error) {
        placeholder.text = '-- Error loading collections --';
        logMessage(`Failed to load collections: ${error.message}`, 'error');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
    setupEventListeners();
    startHealthCheck();

    // Clear credentials after 1 hour of inactivity
    let inactivityTimeout;
    const resetInactivityTimer = () => {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(() => {
            localStorage.removeItem(CREDS_STORAGE_KEY);
            location.reload();
        }, 60 * 60 * 1000); // 1 hour
    };
    ['click', 'keypress', 'scroll', 'mousemove'].forEach(event => {
        document.addEventListener(event, resetInactivityTimer);
    });
    resetInactivityTimer();
});

async function initializeApp() {
    // Initialize DOM elements
    statusBanner = document.getElementById('status-banner');
    credentialsForm = document.getElementById('credentials-form');
    credentialsSection = document.getElementById('credentials-section');
    operationsSection = document.getElementById('operations-section');
    logsSection = document.getElementById('logs-section');
    logsContent = document.getElementById('logs-content');

    // Status elements
    internetStatus = document.getElementById('internet-status');
    awsStatus = document.getElementById('aws-status');
    apiStatus = document.getElementById('api-status');

    // Log any missing elements for debugging
    const elements = { statusBanner, credentialsForm, credentialsSection, operationsSection, internetStatus, awsStatus, apiStatus };
    for (const [name, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`Element not found: ${name}`);
        }
    }

    // Check if AWS is already connected on the backend
    try {
        const response = await fetch('/health');
        const data = await response.json();

        if (data.aws_status === 'connected') {
            // If AWS is already connected, show the operations section
            credentialsSection.classList.add('hidden');
            operationsSection.classList.remove('hidden');
            updateAwsStatus(true);
            
            // Load collections for the dropdown
            await loadCollectionsForDropdown();
        }
    } catch (error) {
        console.error('Error checking connection status:', error);
        // Default to showing credentials form if there's an error
    }
}

function setupEventListeners() {
    if (!credentialsForm) {
        console.error('Credentials form not found');
        return;
    }
    
    // Set up logs buttons
    const copyLogsBtn = document.getElementById('copy-logs-btn');
    const dismissLogsBtn = document.getElementById('dismiss-logs-btn');
    const refreshCollectionsBtn = document.getElementById('refresh-collections-btn');
    const createCollectionToggleBtn = document.getElementById('create-collection-toggle-btn');
    const cancelCreateBtn = document.getElementById('cancel-create-btn');
    const collectionCreateForm = document.getElementById('collection-create-form');
    
    if (copyLogsBtn) {
        copyLogsBtn.addEventListener('click', copyLogs);
    }
    
    if (dismissLogsBtn) {
        dismissLogsBtn.addEventListener('click', clearLogs);
    }
    
    if (refreshCollectionsBtn) {
        refreshCollectionsBtn.addEventListener('click', loadCollectionsForDropdown);
    }
    
    // Collection creation form toggle
    if (createCollectionToggleBtn) {
        createCollectionToggleBtn.addEventListener('click', () => {
            const formPanel = document.getElementById('create-collection-form');
            if (formPanel) {
                formPanel.classList.remove('hidden');
                document.getElementById('new-collection-id').focus();
            }
        });
    }
    
    if (cancelCreateBtn) {
        cancelCreateBtn.addEventListener('click', () => {
            const formPanel = document.getElementById('create-collection-form');
            if (formPanel) {
                formPanel.classList.add('hidden');
                document.getElementById('new-collection-id').value = '';
            }
        });
    }
    
    // Collection creation form submission
    if (collectionCreateForm) {
        collectionCreateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createCollection();
        });
    }

    // Refresh dropdowns after tab switch or other triggers (optional)
    // Example: document.getElementById('collections-tab-btn').addEventListener('click', populateAllCollectionDropdowns);
    // You can add more triggers as needed.


    // Populate both collection dropdowns (search faces and add photo)
    const addPhotoCollectionSelect = document.getElementById('add-photo-collection-id');
    const searchFacesCollectionSelect = document.getElementById('collection-id');
    const deleteFacesCollectionSelect = document.getElementById('delete-faces-collection-id');

    async function populateAllCollectionDropdowns() {
        // Helper to fill a dropdown
        function fillDropdown(dropdown, collections, errorMsg) {
            if (!dropdown) return;
            dropdown.innerHTML = '';
            if (collections && collections.length > 0) {
                collections.forEach(cid => {
                    const opt = document.createElement('option');
                    opt.value = cid;
                    opt.textContent = cid;
                    dropdown.appendChild(opt);
                });
            } else {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = errorMsg || 'No collections available';
                dropdown.appendChild(opt);
            }
        }
        try {
            const response = await fetch('/api/collections');
            const data = await response.json();
            if (response.ok && data.CollectionIds) {
                fillDropdown(addPhotoCollectionSelect, data.CollectionIds);
                fillDropdown(searchFacesCollectionSelect, data.CollectionIds);
                fillDropdown(deleteFacesCollectionSelect, data.CollectionIds);
            } else {
                fillDropdown(addPhotoCollectionSelect, [], 'No collections available');
                fillDropdown(searchFacesCollectionSelect, [], 'No collections available');
                fillDropdown(deleteFacesCollectionSelect, [], 'No collections available');
            }
        } catch (err) {
            fillDropdown(addPhotoCollectionSelect, [], 'Error loading collections');
            fillDropdown(searchFacesCollectionSelect, [], 'Error loading collections');
            fillDropdown(deleteFacesCollectionSelect, [], 'Error loading collections');
        }
    }
    // Populate on load
    populateAllCollectionDropdowns();
    // Also refresh after creating a collection
    window.populateAllCollectionDropdowns = populateAllCollectionDropdowns;

    // Add photo to collection form
    const photoToCollectionForm = document.getElementById('photo-to-collection-form');
    if (photoToCollectionForm) {
        photoToCollectionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addPhotoToCollection();
        });
    }

    // Delete faces from collection form
    const deleteFacesForm = document.getElementById('delete-faces-from-collection-form');
    if (deleteFacesForm) {
        deleteFacesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await deleteFacesFromCollection();
        });
    }

    // Render collections list with delete buttons
    async function listCollections() {
        const collectionsListDiv = document.getElementById('collections-list');
        if (!collectionsListDiv) return;
        collectionsListDiv.innerHTML = '';
        try {
            const response = await fetch('/api/collections');
            const data = await response.json();
            if (response.ok && data.CollectionIds && data.CollectionIds.length > 0) {
                const ul = document.createElement('ul');
                data.CollectionIds.forEach(cid => {
                    const li = document.createElement('li');
                    li.textContent = cid + ' ';
                    const delBtn = document.createElement('button');
                    delBtn.textContent = 'Delete';
                    delBtn.className = 'delete-collection-btn';
                    delBtn.addEventListener('click', () => confirmDeleteCollection(cid));
                    li.appendChild(delBtn);
                    ul.appendChild(li);
                });
                collectionsListDiv.appendChild(ul);
            } else {
                collectionsListDiv.textContent = 'No collections found.';
            }
        } catch (err) {
            collectionsListDiv.textContent = 'Error loading collections.';
        }
    }
    // Call on load
    listCollections();
    window.listCollections = listCollections;

    // Delete collection handler
    async function confirmDeleteCollection(collectionId) {
        if (!confirm(`Are you sure you want to delete collection '${collectionId}'? This cannot be undone.`)) return;
        updateApiStatus('loading', 'Deleting collection');
        logMessage(`Deleting collection: ${collectionId}`);
        try {
            const response = await fetch(`/api/collections/${encodeURIComponent(collectionId)}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (response.ok) {
                updateApiStatus('success', 'Deleting collection');
                logMessage(data.message, 'success');
                await listCollections();
                await populateAllCollectionDropdowns();
            } else {
                updateApiStatus('error', 'Deleting collection');
                logMessage(`Error: ${data.detail || data.error || 'Failed to delete collection'}`, 'error');
            }
        } catch (error) {
            updateApiStatus('error', 'Deleting collection');
            logMessage(`Delete collection operation failed: ${error.message}`, 'error');
        }
    }


    // Handle credentials submission
    credentialsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const accessKey = document.getElementById('access-key')?.value;
        const secretKey = document.getElementById('secret-key')?.value;
        const region = document.getElementById('region')?.value;

        if (!accessKey || !secretKey || !region) {
            showError('All credential fields are required');
            return;
        }

        await setCredentials({ accessKey, secretKey, region });
    });

    // Handle collection listing
    const listCollectionsBtn = document.getElementById('list-collections-btn');
    if (listCollectionsBtn) {
        listCollectionsBtn.addEventListener('click', async () => {
            await listCollections();
        });
    } else {
        console.error('List collections button not found');
    }

    // Handle search faces form
    const searchFacesForm = document.getElementById('search-faces-form');
    if (searchFacesForm) {
        searchFacesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await searchFaces();
        });
    } else {
        console.error('Search faces form not found');
    }

    // Handle detect labels form
    const detectLabelsForm = document.getElementById('detect-labels-form');
    if (detectLabelsForm) {
        detectLabelsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await detectLabels();
        });
    } else {
        console.error('Detect labels form not found');
    }

    // Handle tab switching
    const tabButtons = document.querySelectorAll('.tab-btn');
    if (tabButtons.length > 0) {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                switchTab(btn.dataset.tab);
            });
        });
    } else {
        console.error('Tab buttons not found');
    }
}

function startHealthCheck() {
    // Clear existing interval if any
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }

    // Initial check
    checkHealth();

    // Set up periodic checks every 30 seconds
    healthCheckInterval = setInterval(checkHealth, 30000);
}

async function checkHealth() {
    try {
        // First check internet connectivity
        const internetCheck = await fetch('https://www.google.com/favicon.ico', {
            mode: 'no-cors',
            cache: 'no-cache'
        });
        updateInternetStatus(true);

        // Then check our service health
        const response = await fetch('/health');
        const data = await response.json();

        if (data.aws_status === 'connected') {
            updateAwsStatus(true);
            statusBanner.style.display = 'none';
        } else {
            updateAwsStatus(false);
            if (data.aws_status === 'not_configured') {
                showError('AWS credentials not configured');
            } else {
                showError('AWS connection failed');
            }
        }
    } catch (error) {
        // If we can't reach Google, we're offline
        if (!error.message.includes('/health')) {
            updateInternetStatus(false);
            updateAwsStatus(false);
            showError('No internet connection');
        } else {
            // If we can't reach our service but have internet
            updateInternetStatus(true);
            updateAwsStatus(false);
            showError('Service is not responding');
        }
    }
}

async function setCredentials(credentials) {
    // After credentials are set, refresh all dropdowns
    await populateAllCollectionDropdowns();
    // Clear previous logs
    clearLogs();
    
    updateApiStatus('loading', 'Setting credentials');
    try {
        const response = await fetch('/api/set-credentials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(credentials)
        });

        const data = await response.json();

        if (response.ok) {
            credentialsSection.classList.add('hidden');
            operationsSection.classList.remove('hidden');
            
            // Start the health check
            startHealthCheck();
            
            updateApiStatus('success', 'Setting credentials');
            updateAwsStatus(true);
            logMessage('AWS credentials set successfully', 'success');
        } else {
            // Log the detailed error message if available
            if (data.detail) {
                logMessage(`Error: ${data.detail}`, 'error');
            }
            throw new Error(data.error || 'Failed to set credentials');
        }
    } catch (error) {
        updateApiStatus('error', 'Setting credentials');
        updateAwsStatus(false);
        showError(error.message);
        logMessage(`Failed to set credentials: ${error.message}`, 'error');
    }
}

async function listCollections() {
    updateApiStatus('loading', 'Listing collections');
    try {
        const response = await fetch('/api/collections');
        const data = await response.json();

        if (response.ok) {
            const collectionsList = document.getElementById('collections-list');
            collectionsList.innerHTML = '';

            if (data.CollectionIds && data.CollectionIds.length > 0) {
                logMessage(`Found ${data.CollectionIds.length} collections`, 'success');
                data.CollectionIds.forEach(async (collectionId) => {
                    const collectionDiv = document.createElement('div');
                    collectionDiv.className = 'result-item';
                    
                    // Get collection details
                    const details = await getCollectionDetails(collectionId);
                    logMessage(`Collection: ${collectionId}, Face Count: ${details.FaceCount}`);
                    
                    collectionDiv.innerHTML = `
                        <p><strong>Collection ID:</strong> ${collectionId}</p>
                        <p><strong>Face Count:</strong> ${details.FaceCount}</p>
                        <p><strong>Created:</strong> ${new Date(details.CreationTimestamp).toLocaleString()}</p>
                    `;
                    collectionsList.appendChild(collectionDiv);
                });
            } else {
                collectionsList.innerHTML = '<p>No collections found</p>';
                logMessage('No collections found');
            }
            updateApiStatus('success', 'Listing collections');
        } else {
            logMessage(`Error: ${data.error || 'Failed to list collections'}`, 'error');
            throw new Error(data.error || 'Failed to list collections');
        }
    } catch (error) {
        updateApiStatus('error', 'Listing collections');
        showError(error.message);
        logMessage(`Failed to list collections: ${error.message}`, 'error');
    }
}

async function addPhotoToCollection() {
    clearLogs();
    const resultDiv = document.getElementById('add-photo-result');
    if (resultDiv) resultDiv.innerHTML = '';
    const collectionId = document.getElementById('add-photo-collection-id').value;
    const imageInput = document.getElementById('add-photo-image');
    const imageFile = imageInput.files[0];
    if (!collectionId) {
        updateStatusBanner('Please select a collection', 'error');
        logMessage('Error: No collection selected', 'error');
        return;
    }
    if (!imageFile) {
        updateStatusBanner('Please select an image', 'error');
        logMessage('Error: No image selected', 'error');
        return;
    }
    updateApiStatus('loading', 'Adding photo to collection');
    logMessage(`Adding photo to collection: ${collectionId}`);
    try {
        const formData = new FormData();
        formData.append('image', imageFile);
        const response = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/faces`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (response.ok) {
            updateApiStatus('success', 'Adding photo to collection');
            logMessage('Photo added and face(s) indexed successfully', 'success');
            if (resultDiv) {
                if (data.FaceRecords && data.FaceRecords.length > 0) {
                    resultDiv.innerHTML = `<b>Indexed Faces:</b><ul>` +
                        data.FaceRecords.map(r => `<li>FaceId: ${r.Face.FaceId}, Confidence: ${r.Face.Confidence.toFixed(2)}%</li>`).join('') +
                        `</ul>`;
                } else {
                    resultDiv.innerHTML = '<b>No faces detected in the image.</b>';
                }
            }
        } else {
            updateApiStatus('error', 'Adding photo to collection');
            if (data.detail) logMessage(`Error: ${data.detail}`, 'error');
            if (resultDiv) resultDiv.innerHTML = `<span class="error">${data.detail || data.error || 'Failed to add photo'}</span>`;
            throw new Error(data.error || 'Failed to add photo');
        }
    } catch (error) {
        updateApiStatus('error', 'Adding photo to collection');
        showError(error.message);
        logMessage(`Add photo operation failed: ${error.message}`, 'error');
    }
}

async function deleteFacesFromCollection() {
    clearLogs();
    const resultDiv = document.getElementById('delete-faces-result');
    if (resultDiv) resultDiv.innerHTML = '';
    const collectionId = document.getElementById('delete-faces-collection-id').value;
    const faceIdsRaw = document.getElementById('delete-face-ids').value;
    if (!collectionId) {
        updateStatusBanner('Please select a collection', 'error');
        logMessage('Error: No collection selected', 'error');
        return;
    }
    if (!faceIdsRaw) {
        updateStatusBanner('Please enter Face IDs', 'error');
        logMessage('Error: No Face IDs provided', 'error');
        return;
    }
    // Split by comma, newline, or whitespace, and filter empty
    const faceIds = faceIdsRaw.split(/[,\s\n]+/).map(s => s.trim()).filter(Boolean);
    if (faceIds.length === 0) {
        updateStatusBanner('Please enter valid Face IDs', 'error');
        logMessage('Error: No valid Face IDs provided', 'error');
        return;
    }
    updateApiStatus('loading', 'Deleting faces from collection');
    logMessage(`Deleting faces from collection: ${collectionId}`);
    try {
        const response = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/faces/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faceIds })
        });
        const data = await response.json();
        if (response.ok) {
            updateApiStatus('success', 'Deleting faces from collection');
            logMessage(data.message, 'success');
            if (resultDiv) {
                resultDiv.innerHTML = `<b>Deleted Face IDs:</b> <br>${(data.DeletedFaces || []).join(', ')}`;
            }
        } else {
            updateApiStatus('error', 'Deleting faces from collection');
            logMessage(`Error: ${data.detail || data.error || 'Failed to delete faces'}`, 'error');
            if (resultDiv) resultDiv.innerHTML = `<span class="error">${data.detail || data.error || 'Failed to delete faces'}</span>`;
        }
    } catch (error) {
        updateApiStatus('error', 'Deleting faces from collection');
        showError(error.message);
        logMessage(`Delete faces operation failed: ${error.message}`, 'error');
    }
}

async function createCollection() {
    // Clear previous logs
    clearLogs();
    
    const newCollectionId = document.getElementById('new-collection-id').value.trim();
    
    if (!newCollectionId) {
        updateStatusBanner('Please enter a collection ID', 'error');
        logMessage('Error: Collection ID is required', 'error');
        return;
    }
    
    updateApiStatus('loading', 'Creating collection');
    logMessage(`Creating collection: ${newCollectionId}`);
    
    try {
        const response = await fetch('/api/collections', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ collectionId: newCollectionId })
        });

        const data = await response.json();

        if (response.ok) {
            // Reset form and hide it
            document.getElementById('new-collection-id').value = '';
            document.getElementById('create-collection-form').classList.add('hidden');
            
            // Update UI
            updateApiStatus('success', 'Creating collection');
            logMessage(`Collection '${newCollectionId}' created successfully with ARN: ${data.collectionArn}`, 'success');
            
            // Refresh collections list and dropdowns
            await listCollections();
            await populateAllCollectionDropdowns();
        } else {
            updateApiStatus('error', 'Creating collection');
            
            // Log the detailed error message if available
            if (data.detail) {
                logMessage(`Error: ${data.detail}`, 'error');
            }
            
            throw new Error(data.error || 'Failed to create collection');
        }
    } catch (error) {
        updateApiStatus('error', 'Creating collection');
        showError(error.message);
        logMessage(`Create collection operation failed: ${error.message}`, 'error');
    }
}

function getCollectionDetails(collectionId) {
    try {
        return fetch(`/api/collections/${collectionId}`)
            .then(response => response.json())
            .then(data => {
                return {
                    FaceCount: data.FaceCount || 'N/A',
                    CreationTimestamp: new Date(data.CreationTimestamp || Date.now()).toLocaleString()
                };
            });
    } catch (error) {
        console.error('Error fetching collection details:', error);
        return { FaceCount: 'N/A', CreationTimestamp: 'N/A' };
    }
}

async function searchFaces() {
    // Clear previous logs
    clearLogs();
    
    const collectionId = document.getElementById('collection-id').value;
    const imageFile = document.getElementById('face-image').files[0];

    if (!collectionId) {
        updateStatusBanner('Please select a collection', 'error');
        logMessage('Error: No collection selected', 'error');
        return;
    }

    if (!imageFile) {
        updateStatusBanner('Please select an image', 'error');
        logMessage('Error: No image selected', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('collectionId', collectionId);

    updateApiStatus('loading', 'Searching faces');
    logMessage(`Searching for faces in collection: ${collectionId}`);
    
    try {
        const response = await fetch('/api/search-faces', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            const searchResults = document.getElementById('search-results');
            searchResults.innerHTML = '';

            if (data.FaceMatches && data.FaceMatches.length > 0) {
                logMessage(`Found ${data.FaceMatches.length} matching faces`, 'success');
                
                data.FaceMatches.forEach(match => {
                    const matchDiv = document.createElement('div');
                    matchDiv.className = 'result-item';
                    matchDiv.innerHTML = `
                        <p>Similarity: ${match.Similarity.toFixed(2)}%</p>
                        <p>Face ID: ${match.Face.FaceId}</p>
                    `;
                    searchResults.appendChild(matchDiv);
                    
                    logMessage(`Match: Face ID ${match.Face.FaceId} with ${match.Similarity.toFixed(2)}% similarity`);
                });
            } else {
                searchResults.innerHTML = '<p>No matching faces found</p>';
                logMessage('No matching faces found in the collection');
            }
            updateApiStatus('success', 'Searching faces');
        } else {
            updateApiStatus('error', 'Searching faces');
            
            // Log the detailed error message if available
            if (data.detail) {
                logMessage(`Error: ${data.detail}`, 'error');
            }
            
            throw new Error(data.error || 'Face search failed');
        }
    } catch (error) {
        updateApiStatus('error', 'Searching faces');
        showError(error.message);
        logMessage(`Search faces operation failed: ${error.message}`, 'error');
    }
}

async function detectLabels() {
    const imageFile = document.getElementById('label-image').files[0];

    if (!imageFile) {
        updateStatusBanner('Please select an image', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('image', imageFile);

    updateApiStatus('loading', 'Detecting labels');
    try {
        const response = await fetch('/api/detect-labels', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            const labelsResults = document.getElementById('labels-results');
            labelsResults.innerHTML = '';

            if (data.Labels && data.Labels.length > 0) {
                data.Labels.forEach(label => {
                    const labelDiv = document.createElement('div');
                    labelDiv.className = 'result-item';
                    labelDiv.innerHTML = `
                        <p>${label.Name}: ${(label.Confidence).toFixed(2)}%</p>
                    `;
                    labelsResults.appendChild(labelDiv);
                });
            } else {
                labelsResults.innerHTML = '<p>No labels detected</p>';
            }
            updateApiStatus('success', 'Detecting labels');
        } else {
            updateApiStatus('error', 'Detecting labels');
            throw new Error(data.error || 'Label detection failed');
        }
    } catch (error) {
        updateApiStatus('error', 'Detecting labels');
        showError(error.message);
    }
}

function switchTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabId);
    });
}

function updateStatusBanner(message, type) {
    if (!statusBanner) {
        console.error('Status banner element not found');
        return;
    }

    statusBanner.textContent = message;
    statusBanner.className = type;
    statusBanner.classList.add(type);
    statusBanner.style.display = 'block'; // Make sure the banner is visible
}

function showError(message) {
    updateStatusBanner(message, 'error');
}

function logMessage(message, type = 'info') {
    if (!logsContent) return;
    
    // Make logs section visible
    if (logsSection) {
        logsSection.classList.remove('hidden');
    }
    
    // Create log entry
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = type;
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    // Add to logs
    logsContent.appendChild(logEntry);
    
    // Auto-scroll to bottom
    logsContent.scrollTop = logsContent.scrollHeight;
}

function clearLogs() {
    if (logsContent) {
        logsContent.innerHTML = '';
    }
    
    if (logsSection) {
        logsSection.classList.add('hidden');
    }
}

function copyLogs() {
    if (!logsContent) return;
    
    // Get all log text
    const logText = Array.from(logsContent.children)
        .map(entry => entry.textContent)
        .join('\n');
    
    if (logText.trim() === '') {
        logMessage('No logs to copy', 'warning');
        return;
    }
    
    // Copy to clipboard
    navigator.clipboard.writeText(logText)
        .then(() => {
            logMessage('Logs copied to clipboard', 'success');
        })
        .catch(err => {
            console.error('Failed to copy logs:', err);
            logMessage('Failed to copy logs to clipboard', 'error');
        });
}
