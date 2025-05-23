// Initialize protection state
let protectionEnabled = true;

// Log startup
console.log('Background script initialized');

// Store initial state
if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.set({ enabled: protectionEnabled });
}

// Add declarativeNetRequest rule when protection is enabled
function updateRules(enabled) {
  try {
    if (enabled) {
      console.log('Adding blocking rule for cheating attempts');
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],  // Remove existing rule if any
        addRules: [{
          id: 1,
          priority: 1,
          action: { type: 'block' },
          condition: {
            urlFilter: 'nowledgeable.com/session/*/cheating-attempt',
            domains: ['nowledgeable.com'],
            resourceTypes: ['xmlhttprequest', 'main_frame', 'sub_frame', 'script']
          }
        }]
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error updating rules:', chrome.runtime.lastError);
        } else {
          console.log('Successfully updated blocking rules');
        }
      });
    } else {
      console.log('Removing blocking rule');
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1]  // Remove the rule when protection is disabled
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error removing rules:', chrome.runtime.lastError);
        } else {
          console.log('Successfully removed blocking rules');
        }
      });
    }
  } catch (e) {
    console.error('Error in updateRules:', e);
  }
}

// Initialize rule on startup
setTimeout(() => {
  // Delay rule initialization to ensure API is ready
  updateRules(protectionEnabled);
}, 1000);

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Background received message:', request.action);
  
  if (request.action === 'askMistral') {
    askMistral(request.prompt)
      .then(response => {
        sendResponse({ success: true, data: response });
      })
      .catch(error => {
        console.error('Error calling Mistral API:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Required for async response
  } else if (request.action === 'showNotification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Blocker',
      message: request.text,
      priority: 2
    });
  } else if (request.action === 'copyToClipboard') {
    // Send a message back to content script to copy text to clipboard
    console.log('Received copyToClipboard request, forwarding to content script');
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs[0] && tabs[0].id) {
        console.log('Sending performCopy message to tab:', tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'performCopy', 
          text: request.text 
        }, function(response) {
          console.log('Got response from content script:', response);
        });
      } else {
        console.error('No active tab found to send message to');
      }
    });
  } else if (request.action === 'enableProtection') {
    protectionEnabled = true;
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ enabled: true });
    }
    updateRules(true); // Update blocking rules
    chrome.action.setIcon({ path: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }});
  } else if (request.action === 'disableProtection') {
    protectionEnabled = false;
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ enabled: false });
    }
    updateRules(false); // Update blocking rules
    // Use grayscale icon when disabled
    chrome.action.setIcon({ path: {
      "16": "icons/icon16_disabled.png",
      "48": "icons/icon48_disabled.png",
      "128": "icons/icon128_disabled.png"
    }});
  }
});

// Function to make API call to local server
async function askMistral(prompt) {
  try {
    console.log('Making API call to Mistral with prompt:', prompt.substring(0, 50) + '...');
    const response = await fetch('https://localhost:3005/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `prompt=${encodeURIComponent(prompt)}`,
    });

    const data = await response.json();
    console.log('Received API response');
    console.log(data);
    return data.response;
  } catch (error) {
    console.error('Error calling Mistral API:', error);
    throw error;
  }
} 