// Global variables
let statusBanner;
let credentialsForm;
let operationsSection;
let saveCredentialsCheckbox;

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

// Credentials storage key
// Encryption key for credentials (generated on load)
let encryptionKey;

// Generate a random encryption key
function generateEncryptionKey() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Encrypt data
async function encryptData(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));
    const keyBuffer = encoder.encode(encryptionKey);
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        dataBuffer
    );
    return {
        iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
        data: Array.from(new Uint8Array(encryptedData)).map(b => b.toString(16).padStart(2, '0')).join('')
    };
}

// Decrypt data
async function decryptData(encrypted) {
    try {
        const encoder = new TextEncoder();
        const keyBuffer = encoder.encode(encryptionKey);
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );
        const iv = new Uint8Array(encrypted.iv.match(/.{2}/g).map(byte => parseInt(byte, 16)));
        const data = new Uint8Array(encrypted.data.match(/.{2}/g).map(byte => parseInt(byte, 16)));
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            data
        );
        return JSON.parse(new TextDecoder().decode(decryptedBuffer));
    } catch (error) {
        console.error('Failed to decrypt credentials');
        return null;
    }
}

const CREDS_STORAGE_KEY = 'aws_rekognition_credentials_encrypted';

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    // Generate encryption key on load
    encryptionKey = generateEncryptionKey();
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
    operationsSection = document.getElementById('operations-section');
    saveCredentialsCheckbox = document.getElementById('save-credentials');
    
    // Status elements
    internetStatus = document.getElementById('internet-status');
    awsStatus = document.getElementById('aws-status');
    apiStatus = document.getElementById('api-status');
    
    // Log any missing elements for debugging
    const elements = { statusBanner, credentialsForm, operationsSection, saveCredentialsCheckbox, internetStatus, awsStatus, apiStatus };
    for (const [name, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`Element not found: ${name}`);
        }
    }
    
    try {
        // Check for saved credentials
        const saved = localStorage.getItem(CREDS_STORAGE_KEY);
        if (saved) {
            const encrypted = JSON.parse(saved);
            try {
                const credentials = await decryptData(encrypted);
                // Auto-fill the form
                const accessKeyInput = document.getElementById('access-key');
                const secretKeyInput = document.getElementById('secret-key');
                const regionSelect = document.getElementById('region');
                
                if (accessKeyInput) accessKeyInput.value = credentials.accessKey;
                if (secretKeyInput) secretKeyInput.value = credentials.secretKey;
                if (regionSelect) regionSelect.value = credentials.region;
                if (saveCredentialsCheckbox) saveCredentialsCheckbox.checked = true;
            } catch (error) {
                // If decryption fails, clear saved credentials
                localStorage.removeItem(CREDS_STORAGE_KEY);
            }
        }
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

function setupEventListeners() {
    if (!credentialsForm) {
        console.error('Credentials form not found');
        return;
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

            if (saveCredentialsCheckbox.checked) {
                const encrypted = await encryptData(credentials);
                localStorage.setItem(CREDS_STORAGE_KEY, JSON.stringify(encrypted));
            } else {
                localStorage.removeItem(CREDS_STORAGE_KEY);
            }

            startHealthCheck();
            updateApiStatus('success', 'Setting credentials');
        } else {
            updateApiStatus('error', 'Setting credentials');
            throw new Error(data.error || 'Failed to set credentials');
        }
    } catch (error) {
        updateApiStatus('error', 'Setting credentials');
        showError(error.message);
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
                data.CollectionIds.forEach(async (collectionId) => {
                    const details = await getCollectionDetails(collectionId);
                    const collectionDiv = document.createElement('div');
                    collectionDiv.className = 'result-item';
                    collectionDiv.innerHTML = `
                        <h3>${collectionId}</h3>
                        <p>Face Count: ${details.FaceCount}</p>
                        <p>Created: ${new Date(details.CreationTimestamp).toLocaleString()}</p>
                    `;
                    collectionsList.appendChild(collectionDiv);
                });
            } else {
                collectionsList.innerHTML = '<p>No collections found</p>';
            }
            updateApiStatus('success', 'Listing collections');
        } else {
            updateApiStatus('error', 'Listing collections');
            throw new Error(data.error || 'Failed to list collections');
        }
    } catch (error) {
        updateApiStatus('error', 'Listing collections');
        showError(error.message);
    }
}

async function getCollectionDetails(collectionId) {
    try {
        const response = await fetch(`/api/collections/${collectionId}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching collection details:', error);
        return { FaceCount: 'N/A', CreationTimestamp: 'N/A' };
    }
}

async function searchFaces() {
    const collectionId = document.getElementById('collection-id').value;
    const imageFile = document.getElementById('face-image').files[0];

    if (!imageFile) {
        updateStatusBanner('Please select an image', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('collectionId', collectionId);

    updateApiStatus('loading', 'Searching faces');
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
                data.FaceMatches.forEach(match => {
                    const matchDiv = document.createElement('div');
                    matchDiv.className = 'result-item';
                    matchDiv.innerHTML = `
                        <p>Similarity: ${match.Similarity.toFixed(2)}%</p>
                        <p>Face ID: ${match.Face.FaceId}</p>
                    `;
                    searchResults.appendChild(matchDiv);
                });
            } else {
                searchResults.innerHTML = '<p>No matching faces found</p>';
            }
            updateApiStatus('success', 'Searching faces');
        } else {
            updateApiStatus('error', 'Searching faces');
            throw new Error(data.error || 'Face search failed');
        }
    } catch (error) {
        updateApiStatus('error', 'Searching faces');
        showError(error.message);
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
