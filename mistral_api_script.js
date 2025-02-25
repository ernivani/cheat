// ==UserScript==
// @name         Chatbot via Ollama Local API
// @namespace    http://tampermonkey.net/
// @version      2024-10-25
// @description  Ask Chatbot model questions via Ollama local API
// @author       ernicani
// @match        https://nowledgeable.com/*
// @match        https://www.nowledgeable.com/*
// @include      /^https?:\/\/(www\.)?nowledgeable\.com\/.*$/
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-start
// ==/UserScript==

// Add debugging at script load
console.log("[Chatbot Debug] Script loading on Nowledgeable...");
console.log("[Chatbot Debug] Current URL:", window.location.href);
console.log("[Chatbot Debug] Document readyState:", document.readyState);

// Add domain check
function isNowledgeableDomain() {
    return window.location.hostname.includes('nowledgeable.com');
}

function getSelectionText() {
    let text = "";

    if (window.getSelection) {
        text = window.getSelection().toString();
    } else if (document.selection && document.selection.type != "Control") {
        text = document.selection.createRange().text;
    }

    return text;
}

(function () {
    "use strict";
    
    // Ensure we're running in a browser environment and on the correct domain
    if (typeof window === 'undefined' || typeof document === 'undefined' || !isNowledgeableDomain()) {
        console.error("[Chatbot Error] Script requires browser environment and Nowledgeable domain");
        return;
    }

    console.log("[Chatbot] Script starting initialization...");
    console.log("[Chatbot Debug] Window object available:", !!window);
    console.log("[Chatbot Debug] Document object available:", !!document);

    let container; // Déclarer le conteneur dans la portée globale
    let currentOpacity = 1.0; // Opacité par défaut
    let shadowRoot; // Shadow DOM root
    let hostElement; // Host element for shadow DOM
    let maxInitAttempts = 10; // Maximum number of initialization attempts
    let initAttempts = 0; // Current number of attempts
    let chatbotInitialized = false; // Flag to track if chatbot is initialized
    let removeMutationObserver = null; // Observer to prevent removal
    let CHATBOT_ID = 'chatbot-host-' + Math.random().toString(36).substring(2, 15); // Unique ID for each page load

    // Intercept and override removeChild and remove methods to protect our element
    function protectFromRemoval() {
        // Store original methods
        const originalRemoveChild = Element.prototype.removeChild;
        const originalRemove = Element.prototype.remove;
        
        // Override removeChild
        Element.prototype.removeChild = function(child) {
            if (child && (child.id === CHATBOT_ID || child.hasAttribute('data-chatbot-host'))) {
                console.log("[Chatbot] Prevented removeChild of chatbot element");
                return child; // Return the child without removing it
            }
            return originalRemoveChild.apply(this, arguments);
        };
        
        // Override remove
        Element.prototype.remove = function() {
            if (this && (this.id === CHATBOT_ID || this.hasAttribute('data-chatbot-host'))) {
                console.log("[Chatbot] Prevented remove of chatbot element");
                return this; // Return without removing
            }
            return originalRemove.apply(this, arguments);
        };
        
        console.log("[Chatbot] DOM protection installed");
    }

    // Wait for DOM to be fully loaded
    function init() {
        // Install protection as early as possible
        protectFromRemoval();
        
        // Check if API server is running
        checkApiServer();
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(initializeChatbot, 1000);
            });
        } else {
            // Delay initialization to ensure the page is fully loaded
            setTimeout(initializeChatbot, 1000);
        }
    }

    // Function to check if the API server is running
    function checkApiServer() {
        console.log("[Chatbot] Checking if API server is running...");
        
        // Try HTTPS first, then HTTP as fallback
        tryServerHealth("https://localhost:3000/health", () => {
            console.log("[Chatbot] API server is running on HTTPS localhost");
        }, () => {
            // Try HTTPS IP
            tryServerHealth("https://127.0.0.1:3000/health", () => {
                console.log("[Chatbot] API server is running on HTTPS IP");
            }, () => {
                // Try HTTP localhost
                tryServerHealth("http://localhost:3000/health", () => {
                    console.log("[Chatbot] API server is running on HTTP localhost");
                }, () => {
                    // Try HTTP IP
                    tryServerHealth("http://127.0.0.1:3000/health", () => {
                        console.log("[Chatbot] API server is running on HTTP IP");
                    }, () => {
                        // All failed
                        showApiErrorNotification();
                    });
                });
            });
        });
    }

    // Helper function to check server health
    function tryServerHealth(url, onSuccess, onError) {
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            timeout: 5000,
            anonymous: true, // Don't send cookies
            rejectUnauthorized: false, // Accept self-signed certificates
            onload: function(response) {
                if (response.status === 200) {
                    onSuccess();
                } else {
                    console.warn(`[Chatbot] API server at ${url} returned status:`, response.status);
                    onError();
                }
            },
            onerror: function() {
                console.error(`[Chatbot] API server is not running at ${url}`);
                onError();
            },
            ontimeout: function() {
                console.error(`[Chatbot] Health check timed out for ${url}`);
                onError();
            }
        });
    }

    // Function to show API error notification
    function showApiErrorNotification() {
        console.error("[Chatbot] API server is not running");
        
        // Create notification element
        const notification = document.createElement('div');
        notification.style.position = 'fixed';
        notification.style.bottom = '80px';
        notification.style.right = '20px';
        notification.style.backgroundColor = '#ff5252';
        notification.style.color = 'white';
        notification.style.padding = '10px 15px';
        notification.style.borderRadius = '5px';
        notification.style.zIndex = '2147483647';
        notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        notification.style.fontFamily = 'Arial, sans-serif';
        notification.style.fontSize = '14px';
        notification.innerHTML = 'Chatbot API server not found.<br>Make sure your server is running on:<br>- https://localhost:3000 or<br>- http://localhost:3000';
        
        // Add to body if it exists
        if (document.body) {
            document.body.appendChild(notification);
            
            // Remove after 15 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 15000);
        } else {
            // If body doesn't exist yet, wait for it
            document.addEventListener('DOMContentLoaded', () => {
                if (document.body) {
                    document.body.appendChild(notification);
                    
                    // Remove after 15 seconds
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 15000);
                }
            });
        }
    }

    // Main initialization function
    function initializeChatbot() {
        if (isScriptAlreadyRunning()) {
            console.log("[Chatbot] Already running, skipping initialization");
            return;
        }
        
        // Try to find container-fluid first
        const containerFluid = document.querySelector('.container-fluid');
        if (containerFluid) {
            console.log("[Chatbot] Found container-fluid, initializing chatbot...");
            initializeChatbotInterface(containerFluid);
        } else {
            console.log("[Chatbot] container-fluid not found, trying body...");
            if (document.body) {
                initializeChatbotInterface(document.body);
            } else {
                // If body not available yet, retry later
                setTimeout(initializeChatbot, 1000);
            }
        }
    }

    // Function to check if script is already running
    function isScriptAlreadyRunning() {
        return !!document.querySelector(`#${CHATBOT_ID}`) || !!document.querySelector('[data-chatbot-host="true"]');
    }

    // Fonction pour initialiser l'interface Chatbot
    function initializeChatbotInterface(parentElement) {
        try {
            console.log("[Chatbot] Attempting to initialize chatbot interface...");
            console.log("[Chatbot Debug] Current page URL:", window.location.href);
            
            // Vérifier si le script a déjà été injecté sur cette page
            if (isScriptAlreadyRunning() || chatbotInitialized) {
                console.log("[Chatbot] Container already exists, skipping initialization");
                return;
            }

            // Create container and initialize interface
            initializeContainer(parentElement);
            chatbotInitialized = true;
            
            // Set up mutation observer to detect and prevent removal
            setupRemovalProtection();
        } catch (error) {
            console.error("[Chatbot] Error during initialization:", error);
        }
    }

    // Function to set up mutation observer to detect and prevent removal
    function setupRemovalProtection() {
        // Disconnect previous observer if it exists
        if (removeMutationObserver) {
            removeMutationObserver.disconnect();
        }
        
        // Create a new observer
        removeMutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                    // Check if our element was removed
                    for (const node of mutation.removedNodes) {
                        if (node.id === CHATBOT_ID || 
                            (node.hasAttribute && node.hasAttribute('data-chatbot-host')) ||
                            (node.querySelector && (node.querySelector(`#${CHATBOT_ID}`) || node.querySelector('[data-chatbot-host="true"]')))) {
                            
                            console.log("[Chatbot] Detected removal attempt, re-adding element");
                            
                            // Re-add our element if it was removed
            setTimeout(() => {
                                if (!document.querySelector(`#${CHATBOT_ID}`) && !document.querySelector('[data-chatbot-host="true"]')) {
                                    initializeChatbot();
                                }
                            }, 100);
                            
                            break;
                        }
                    }
                }
            }
        });
        
        // Observe the entire document for removals
        removeMutationObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
        
        console.log("[Chatbot] Removal protection observer set up");
    }

    // Function to initialize the container and its contents
    function initializeContainer(parentElement) {
        if (!parentElement) {
            console.error("[Chatbot] Parent element not found!");
            return;
        }

        // Create a host element for the Shadow DOM
        hostElement = document.createElement('div');
        hostElement.id = CHATBOT_ID;
        hostElement.setAttribute('data-chatbot-host', 'true');
        hostElement.style.position = 'fixed';
        hostElement.style.bottom = '20px';
        hostElement.style.right = '20px';
        hostElement.style.zIndex = '2147483647'; // Maximum z-index
        
        // Make it harder to select and remove
        hostElement.style.pointerEvents = 'auto';
        hostElement.style.userSelect = 'none';
        
        // Add additional attributes to make it harder to target
        hostElement.setAttribute('data-permanent', 'true');
        hostElement.setAttribute('data-protected', 'true');
        
        // Attach the host element to the parent element
        parentElement.appendChild(hostElement);
        
        // Create a shadow root
        shadowRoot = hostElement.attachShadow({ mode: 'closed' });
        
        // Create styles for the shadow DOM
        const style = document.createElement('style');
        style.textContent = `
                        #chatbot-container {
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                            border-radius: 8px;
                            background-color: #ffffff;
                            transition: all 0.3s ease;
                            max-width: 400px;
                            width: 90%;
                padding: 15px;
                z-index: 100000;
                opacity: ${currentOpacity};
                        }
                        #chatbot-container button {
                            font-family: inherit;
                            border-radius: 4px;
                            transition: background-color 0.2s;
                padding: 10px 20px;
                background-color: #4CAF50;
                color: white;
                border: none;
                cursor: pointer;
                        }
                        #chatbot-container button:hover {
                            background-color: #45a049;
                        }
                        #chatbot-container textarea {
                            font-family: inherit;
                            border-radius: 4px;
                            border: 1px solid #ddd;
                            padding: 8px;
                            resize: vertical;
                width: 100%;
                height: 100px;
                margin-top: 10px;
                        }
                        #chatbot-container .response-div {
                            background-color: #f8f9fa;
                            border-radius: 4px;
                margin-top: 10px;
                width: 100%;
                max-height: 300px;
                overflow: auto;
                border: 1px solid #ccc;
                padding: 10px;
                white-space: pre-wrap;
                color: black;
                font-size: 14px;
                line-height: 1.5;
            }
            
            /* Code block styling */
            .code-block {
                background-color: #282c34;
                border-radius: 4px;
                margin: 10px 0;
                padding: 12px;
                overflow-x: auto;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 13px;
                line-height: 1.4;
                position: relative;
            }
            
            /* Language-specific styling */
            .language-header {
                background-color: #1e2127;
                color: #abb2bf;
                padding: 4px 8px;
                border-top-left-radius: 4px;
                border-top-right-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                margin-bottom: -4px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            /* Copy button styling */
            .copy-button {
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 3px;
                padding: 2px 8px;
                font-size: 11px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            .copy-button:hover {
                background-color: #45a049;
            }
            
            .copy-button.copied {
                background-color: #2196F3;
            }
            
            /* Java */
            .code-java {
                color: #abb2bf;
            }
            .code-java .keyword {
                color: #c678dd;
            }
            .code-java .string {
                color: #98c379;
            }
            .code-java .number {
                color: #d19a66;
            }
            .code-java .comment {
                color: #5c6370;
                font-style: italic;
            }
            
            /* JavaScript */
            .code-javascript {
                color: #abb2bf;
            }
            .code-javascript .keyword {
                color: #c678dd;
            }
            .code-javascript .string {
                color: #98c379;
            }
            .code-javascript .number {
                color: #d19a66;
            }
            .code-javascript .comment {
                color: #5c6370;
                font-style: italic;
            }
            
            /* Python */
            .code-python {
                color: #abb2bf;
            }
            .code-python .keyword {
                color: #c678dd;
            }
            .code-python .string {
                color: #98c379;
            }
            .code-python .number {
                color: #d19a66;
            }
            .code-python .comment {
                color: #5c6370;
                font-style: italic;
            }
            
            /* CSS */
            .code-css {
                color: #abb2bf;
            }
            .code-css .property {
                color: #e06c75;
            }
            .code-css .value {
                color: #98c379;
            }
            .code-css .selector {
                color: #61afef;
            }
            
            /* HTML */
            .code-html {
                color: #abb2bf;
            }
            .code-html .tag {
                color: #e06c75;
            }
            .code-html .attribute {
                color: #d19a66;
            }
            .code-html .string {
                color: #98c379;
            }
            
            /* SQL */
            .code-sql {
                color: #abb2bf;
            }
            .code-sql .keyword {
                color: #c678dd;
            }
            .code-sql .function {
                color: #61afef;
            }
            .code-sql .number {
                color: #d19a66;
            }
            
            /* C/C++ */
            .code-c, .code-cpp {
                color: #abb2bf;
            }
            .code-c .keyword, .code-cpp .keyword {
                color: #c678dd;
            }
            .code-c .string, .code-cpp .string {
                color: #98c379;
            }
            .code-c .number, .code-cpp .number {
                color: #d19a66;
            }
            .code-c .preprocessor, .code-cpp .preprocessor {
                color: #e06c75;
            }
        `;
        shadowRoot.appendChild(style);
        
        // Create container
        container = document.createElement("div");
        container.id = "chatbot-container";
        shadowRoot.appendChild(container);

        // Add the UI elements
        addUIElements();

        console.log("[Chatbot] Container initialized and attached to parent element");
    }

    // Function to add UI elements to the container
    function addUIElements() {
        // Appeler directement setupEventListeners qui crée maintenant tous les éléments UI
        setupEventListeners();
        
        console.log("[Chatbot] UI elements added to container");
    }

    // Fonction pour configurer les écouteurs d'événements
    function setupEventListeners() {
        // Create button
        const button = document.createElement("button");
        button.innerText = "Ask Chatbot";
        container.appendChild(button);

        // Create textarea
        const textarea = document.createElement("textarea");
        textarea.placeholder = "Ask Chatbot something...";
        container.appendChild(textarea);

        // Create response div
        const responseDiv = document.createElement("div");
        responseDiv.className = "response-div";
        container.appendChild(responseDiv);

        // Add click handler for the button
        button.addEventListener("click", function () {
            console.log("[Chatbot] Button clicked, processing request...");
            const question = textarea.value.trim() + getSelectionText();
            if (question) {
                // Disable input and button during processing
                textarea.disabled = true;
                button.disabled = true;
                
                // Clear previous response
                responseDiv.innerHTML = '';
                
                // Create streaming container
                const streamingContainer = document.createElement('div');
                streamingContainer.className = 'streaming-response';
                responseDiv.appendChild(streamingContainer);
                
                // Show initial connecting message
                streamingContainer.textContent = "Connecting to API...";
                
                // Track the accumulated response
                let fullResponse = '';
                
                // Start streaming request
                askChatbotStreaming(
                    question,
                    // onChunk handler
                    (chunk, isDone) => {
                        if (isDone) {
                            // When streaming is complete, format the full response with code blocks
                            formatResponseWithCodeBlocks(fullResponse, responseDiv);
                            
                            // Re-enable input and button only when done
                            textarea.disabled = false;
                            button.disabled = false;
                        } else {
                            // Add new chunk to the accumulated response
                            fullResponse += chunk;
                            
                            // Update the streaming display with the current accumulated response
                            streamingContainer.textContent = fullResponse;
                            
                            // Auto-scroll to bottom
                            responseDiv.scrollTop = responseDiv.scrollHeight;
                        }
                    },
                    // onError handler
                    (error) => {
                        console.error("[Chatbot] Error:", error);
                        responseDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
                        
                        // Re-enable input and button
                        textarea.disabled = false;
                        button.disabled = false;
                    }
                );
            } else {
                console.log("[Chatbot] Empty question submitted");
                responseDiv.textContent = "Please enter a question.";
            }
        });
        
        // Add Enter key support with passive option
        textarea.addEventListener("keydown", function(e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                button.click();
            }
        }, { passive: false });
    }

    // Function to format response with code blocks
    function formatResponseWithCodeBlocks(text, responseDiv) {
        // Clear the response div
        responseDiv.innerHTML = '';
        
        // Split the text by code blocks
        const parts = text.split(/\`\`\`(\w*)\n([\s\S]*?)\`\`\`/g);
        
        for (let i = 0; i < parts.length; i++) {
            if (i % 3 === 0) {
                // This is regular text
                if (parts[i].trim()) {
                    const textNode = document.createElement('div');
                    textNode.textContent = parts[i];
                    responseDiv.appendChild(textNode);
                }
            } else if (i % 3 === 1) {
                // This is the language identifier
                const language = parts[i] || 'text';
                const code = parts[i + 1];
                
                // Create code block container
                const codeContainer = document.createElement('div');
                codeContainer.className = 'code-container';
                
                // Create language header
                const langHeader = document.createElement('div');
                langHeader.className = 'language-header';
                
                // Add language name
                const langName = document.createElement('span');
                langName.textContent = language.toUpperCase();
                langHeader.appendChild(langName);
                
                // Add copy button
                const copyButton = document.createElement('button');
                copyButton.className = 'copy-button';
                copyButton.textContent = 'Copy';
                copyButton.addEventListener('click', function() {
                    // Copy code to clipboard
                    navigator.clipboard.writeText(code).then(() => {
                        // Visual feedback
                        copyButton.textContent = 'Copied!';
                        copyButton.classList.add('copied');
                        
                        // Reset after 2 seconds
                        setTimeout(() => {
                            copyButton.textContent = 'Copy';
                            copyButton.classList.remove('copied');
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy code:', err);
                        copyButton.textContent = 'Error';
                        
                        // Reset after 2 seconds
                        setTimeout(() => {
                            copyButton.textContent = 'Copy';
                        }, 2000);
            });
        });
                langHeader.appendChild(copyButton);
                
                codeContainer.appendChild(langHeader);
                
                // Create code block
                const codeBlock = document.createElement('pre');
                codeBlock.className = "code-block code-" + language;
                
                // Apply syntax highlighting based on language
                let highlightedCode = '';
                if (language === 'java') {
                    highlightedCode = highlightJava(code);
                } else if (language === 'javascript' || language === 'js') {
                    highlightedCode = highlightJavaScript(code);
                } else if (language === 'python' || language === 'py') {
                    highlightedCode = highlightPython(code);
                } else if (language === 'css') {
                    highlightedCode = highlightCSS(code);
                } else if (language === 'html') {
                    highlightedCode = highlightHTML(code);
                } else if (language === 'sql') {
                    highlightedCode = highlightSQL(code);
                } else if (language === 'c' || language === 'cpp') {
                    highlightedCode = highlightC(code);
                } else {
                    // For other languages, escape HTML entities to prevent XSS
                    highlightedCode = escapeHtml(code);
                }
                
                // Set the highlighted code
                codeBlock.innerHTML = highlightedCode;
                
                codeContainer.appendChild(codeBlock);
                responseDiv.appendChild(codeContainer);
                
                // Skip the next part as we've already processed it
                i++;
            }
        }
    }
    
    // Helper function to escape HTML entities
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Syntax highlighting functions
    function highlightJava(code) {
        return code
            .replace(/\b(public|private|protected|class|static|void|int|double|float|boolean|String|if|else|for|while|return|new|null|true|false)\b/g, '<span class="keyword">$1</span>')
            .replace(/(\/\/.*)/g, '<span class="comment">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/(".*?")/g, '<span class="string">$1</span>')
            .replace(/\b([0-9]+(\.[0-9]+)?)\b/g, '<span class="number">$1</span>');
    }

    function highlightJavaScript(code) {
        return code
            .replace(/\b(var|let|const|function|return|if|else|for|while|do|switch|case|break|continue|new|this|typeof|instanceof|null|undefined|true|false)\b/g, '<span class="keyword">$1</span>')
            .replace(/(\/\/.*)/g, '<span class="comment">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/(".*?")|('.*?')|(`.*?`)/g, '<span class="string">$1</span>')
            .replace(/\b([0-9]+(\.[0-9]+)?)\b/g, '<span class="number">$1</span>');
    }

    function highlightPython(code) {
        return code
            .replace(/\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|in|is|not|and|or|True|False|None)\b/g, '<span class="keyword">$1</span>')
            .replace(/(#.*)/g, '<span class="comment">$1</span>')
            .replace(/(".*?")|('.*?')|(`.*?`)/g, '<span class="string">$1</span>')
            .replace(/\b([0-9]+(\.[0-9]+)?)\b/g, '<span class="number">$1</span>');
    }

    function highlightCSS(code) {
        return code
            .replace(/([\w-]+)(?=\s*:)/g, '<span class="property">$1</span>')
            .replace(/(:.*?;)/g, '<span class="value">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/(#[\w-]+|\.[\w-]+)/g, '<span class="selector">$1</span>');
    }

    function highlightHTML(code) {
        return code
            .replace(/(&lt;[\/]?)([\w-]+)/g, '$1<span class="tag">$2</span>')
            .replace(/(\s+)([\w-]+)(?=\s*=)/g, '$1<span class="attribute">$2</span>')
            .replace(/(".*?")|('.*?')/g, '<span class="string">$1</span>');
    }

    function highlightSQL(code) {
        return code
            .replace(/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|AND|OR|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP BY|ORDER BY|HAVING|LIMIT|AS|ON|VALUES|SET|CREATE|TABLE|INDEX|VIEW|DROP|ALTER|ADD|COLUMN)\b/gi, '<span class="keyword">$1</span>')
            .replace(/\b(COUNT|SUM|AVG|MIN|MAX|CONCAT|SUBSTRING|TRIM|UPPER|LOWER)\b/gi, '<span class="function">$1</span>')
            .replace(/\b([0-9]+(\.[0-9]+)?)\b/g, '<span class="number">$1</span>')
            .replace(/(--.*)/g, '<span class="comment">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/(".*?")|('.*?')/g, '<span class="string">$1</span>');
    }

    function highlightC(code) {
        return code
            .replace(/\b(int|char|float|double|void|struct|union|enum|typedef|const|static|extern|register|auto|volatile|unsigned|signed|short|long|if|else|for|while|do|switch|case|break|continue|return|goto|sizeof)\b/g, '<span class="keyword">$1</span>')
            .replace(/(\/\/.*)/g, '<span class="comment">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>')
            .replace(/(#include|#define|#ifdef|#ifndef|#endif|#pragma|#if|#else|#elif)\b/g, '<span class="preprocessor">$1</span>')
            .replace(/(".*?")/g, '<span class="string">$1</span>')
            .replace(/\b([0-9]+(\.[0-9]+)?)\b/g, '<span class="number">$1</span>');
    }

    // Fonction pour basculer la visibilité de l'interface Chatbot
    function toggleChatbotInterface() {
        console.log("[Chatbot] Toggling interface visibility...");
        if (hostElement) {
            if (hostElement.style.display === "none") {
                hostElement.style.display = "block";
                console.log("[Chatbot] Interface shown");
            } else {
                hostElement.style.display = "none";
                console.log("[Chatbot] Interface hidden");
            }
        } else {
            console.log("[Chatbot] Container not found, initializing new interface");
            initializeChatbot();
        }
    }

    // Fonction pour ajuster l'opacité de l'interface Chatbot
    function adjustOpacity(delta) {
        if (container) {
            currentOpacity = parseFloat(currentOpacity) + delta;
            // Limiter l'opacité entre 0.1 et 1.0
            if (currentOpacity < 0.1) currentOpacity = 0.1;
            if (currentOpacity > 1.0) currentOpacity = 1.0;
            container.style.opacity = currentOpacity;
        }
    }

    // Fonction pour observer les changements d'URL
    function observeUrlChanges() {
        let lastUrl = location.href;
        const observer = new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                // If URL changes, reset initialization state
                chatbotInitialized = false;
                initAttempts = 0;
                // Generate a new unique ID for the new page
                CHATBOT_ID = 'chatbot-host-' + Math.random().toString(36).substring(2, 15);
                // Wait for the new page to load
                setTimeout(initializeChatbot, 1000);
            }
        });
        
        // Only observe if document.body exists
        if (document.body) {
        observer.observe(document.body, { 
            childList: true, 
                subtree: true 
            });
            } else {
            // If body doesn't exist yet, wait for it
            document.addEventListener('DOMContentLoaded', () => {
                if (document.body) {
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                }
            });
        }
    }

    // Fonction pour appeler votre API Node.js et obtenir la réponse de Chatbot en streaming
    function askChatbotStreaming(prompt, onChunk, onError) {
        console.log("[Chatbot] Sending streaming request to API...");
        
        // Add timeout handling
        const timeoutId = setTimeout(() => {
            onError(new Error("API request timed out after 5mins"));
        }, 300000);
        
        // Try HTTPS first, then HTTP as fallback
        tryApiEndpointStreaming("https://localhost:3000/ask", prompt, timeoutId, onChunk, onError, (error) => {
            console.log("[Chatbot] HTTPS localhost failed, trying HTTPS IP...", error);
            
            tryApiEndpointStreaming("https://127.0.0.1:3000/ask", prompt, timeoutId, onChunk, onError, (error) => {
                console.log("[Chatbot] HTTPS IP failed, trying HTTP localhost...", error);
                
                tryApiEndpointStreaming("http://localhost:3000/ask", prompt, timeoutId, onChunk, onError, (error) => {
                    console.log("[Chatbot] HTTP localhost failed, trying HTTP IP...", error);
                    
                    tryApiEndpointStreaming("http://127.0.0.1:3000/ask", prompt, timeoutId, onChunk, onError, (error) => {
                        // All endpoints failed
                        clearTimeout(timeoutId);
                        console.error("[Chatbot] All API endpoints failed:", error);
                        onError(new Error("Could not connect to API server. Make sure it's running on localhost:3000"));
                    });
                });
            });
        });
    }

    // Helper function to try an API endpoint with streaming
    function tryApiEndpointStreaming(url, prompt, timeoutId, onChunk, onError, onEndpointError) {
        GM_xmlhttpRequest({
            method: "POST",
            url: url,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "text/event-stream",
                "Cache-Control": "no-cache"
            },
            data: new URLSearchParams({ prompt }).toString(),
            timeout: 15000, // Shorter timeout for each attempt
            anonymous: true, // Don't send cookies
            rejectUnauthorized: false, // Accept self-signed certificates
            onloadstart: function() {
                console.log(`[Chatbot] Starting request to ${url}`);
            },
            onprogress: function(response) {
                // Process partial response data as it arrives
                if (response.status === 200 && response.responseText) {
                    try {
                        // Process the SSE response
                        const lines = response.responseText.split('\n');
                        
                        for (const line of lines) {
                            if (line.startsWith('data:')) {
                                try {
                                    const eventData = JSON.parse(line.substring(5).trim());
                                    
                                    if (eventData.error) {
                                        onEndpointError(new Error(eventData.error));
                                        return;
                                    }
                                    
                                    // Skip the thinking tags from the model
                                    if (eventData.text && 
                                        !eventData.text.includes('<think>') && 
                                        !eventData.text.includes('</think>')) {
                                        onChunk(eventData.text, false);
                                    }
                                    
                                    // Check if this is the last chunk
                                    if (eventData.done) {
                                        clearTimeout(timeoutId);
                                        onChunk('', true); // Empty chunk with isDone=true
                                    }
                                } catch (e) {
                                    console.error('[Chatbot] Error parsing SSE data:', e, line);
                                }
                            }
                        }
                    } catch (e) {
                        console.error('[Chatbot] Error processing streaming response:', e);
                    }
                }
            },
            onload: function(response) {
                if (response.status === 200) {
                    // Final check to ensure we've processed all data
                    try {
                        // Check if we need to signal completion
                        const lines = response.responseText.split('\n');
                        let foundCompletion = false;
                        
                        for (const line of lines) {
                            if (line.startsWith('data:')) {
                                try {
                                    const eventData = JSON.parse(line.substring(5).trim());
                                    if (eventData.done) {
                                        foundCompletion = true;
                                        break;
                                    }
                                } catch (e) {
                                    // Ignore parsing errors in final check
                                }
                            }
                        }
                        
                        // If we didn't find a completion signal, send one now
                        if (!foundCompletion) {
                            clearTimeout(timeoutId);
                            onChunk('', true); // Signal completion
                        }
                    } catch (e) {
                        console.error('[Chatbot] Error in final response processing:', e);
                        onEndpointError(new Error('Error processing final response: ' + e.message));
                    }
                } else {
                    onEndpointError(new Error(`Request failed with status ${response.status}: ${response.statusText}`));
                }
            },
            onerror: function(error) {
                console.error(`[Chatbot] API network error for ${url}:`, error);
                onEndpointError(error);
            },
            ontimeout: function() {
                console.error(`[Chatbot] API request timed out for ${url}`);
                onEndpointError(new Error('API request timed out'));
            }
        });
    }

    // Create an iframe fallback method if all else fails
    function createIframeFallback() {
        if (document.getElementById('chatbot-iframe')) {
            return; // Already exists
        }
        
        const iframe = document.createElement('iframe');
        iframe.id = 'chatbot-iframe';
        iframe.style.position = 'fixed';
        iframe.style.bottom = '20px';
        iframe.style.right = '20px';
        iframe.style.width = '400px';
        iframe.style.height = '300px';
        iframe.style.border = 'none';
        iframe.style.zIndex = '2147483647';
        
        // Add the iframe to the body
        document.body.appendChild(iframe);
        
        // Get the iframe document
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        
        // Create HTML content for the iframe
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            margin: 0;
            padding: 15px;
            overflow: hidden;
        }
        #chatbot-container {
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-radius: 8px;
            background-color: #ffffff;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        button {
            font-family: inherit;
            border-radius: 4px;
            transition: background-color 0.2s;
            padding: 10px 20px;
            background-color: #4CAF50;
            color: white;
            border: none;
            cursor: pointer;
        }
        button:hover {
            background-color: #45a049;
        }
        textarea {
            font-family: inherit;
            border-radius: 4px;
            border: 1px solid #ddd;
            padding: 8px;
            resize: vertical;
            width: 100%;
            height: 100px;
            margin-top: 10px;
            box-sizing: border-box;
        }
        .response-div {
            background-color: #f8f9fa;
            border-radius: 4px;
            margin-top: 10px;
            width: 100%;
            flex: 1;
            overflow: auto;
            border: 1px solid #ccc;
            padding: 10px;
            white-space: pre-wrap;
            box-sizing: border-box;
            font-size: 14px;
            line-height: 1.5;
        }
        
        /* Code block styling */
        .code-block {
            background-color: #282c34;
            border-radius: 4px;
            margin: 10px 0;
            padding: 12px;
            overflow-x: auto;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.4;
            position: relative;
        }
        
        /* Language-specific styling */
        .language-header {
            background-color: #1e2127;
            color: #abb2bf;
            padding: 4px 8px;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            margin-bottom: -4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        /* Copy button styling */
        .copy-button {
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 3px;
            padding: 2px 8px;
            font-size: 11px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .copy-button:hover {
            background-color: #45a049;
        }
        
        .copy-button.copied {
            background-color: #2196F3;
        }
        
        /* Java */
        .code-java {
            color: #abb2bf;
        }
        .code-java .keyword {
            color: #c678dd;
        }
        .code-java .string {
            color: #98c379;
        }
        .code-java .number {
            color: #d19a66;
        }
        .code-java .comment {
            color: #5c6370;
            font-style: italic;
        }
        
        /* JavaScript */
        .code-javascript {
            color: #abb2bf;
        }
        .code-javascript .keyword {
            color: #c678dd;
        }
        .code-javascript .string {
            color: #98c379;
        }
        .code-javascript .number {
            color: #d19a66;
        }
        .code-javascript .comment {
            color: #5c6370;
            font-style: italic;
        }
        
        /* Python */
        .code-python {
            color: #abb2bf;
        }
        .code-python .keyword {
            color: #c678dd;
        }
        .code-python .string {
            color: #98c379;
        }
        .code-python .number {
            color: #d19a66;
        }
        .code-python .comment {
            color: #5c6370;
            font-style: italic;
        }
        
        /* CSS */
        .code-css {
            color: #abb2bf;
        }
        .code-css .property {
            color: #e06c75;
        }
        .code-css .value {
            color: #98c379;
        }
        .code-css .selector {
            color: #61afef;
        }
        
        /* HTML */
        .code-html {
            color: #abb2bf;
        }
        .code-html .tag {
            color: #e06c75;
        }
        .code-html .attribute {
            color: #d19a66;
        }
        .code-html .string {
            color: #98c379;
        }
        
        /* SQL */
        .code-sql {
            color: #abb2bf;
        }
        .code-sql .keyword {
            color: #c678dd;
        }
        .code-sql .function {
            color: #61afef;
        }
        .code-sql .number {
            color: #d19a66;
        }
        
        /* C/C++ */
        .code-c, .code-cpp {
            color: #abb2bf;
        }
        .code-c .keyword, .code-cpp .keyword {
            color: #c678dd;
        }
        .code-c .string, .code-cpp .string {
            color: #98c379;
        }
        .code-c .number, .code-cpp .number {
            color: #d19a66;
        }
        .code-c .preprocessor, .code-cpp .preprocessor {
            color: #e06c75;
        }
    </style>
</head>
<body>
    <div id="chatbot-container">
        <button id="ask-button">Ask Chatbot</button>
        <textarea id="question-input" placeholder="Ask Chatbot something..."></textarea>
        <div id="response-output" class="response-div"></div>
    </div>
</body>
</html>`;
        
        // Write the HTML content to the iframe
        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();
        
        // Add the JavaScript after the document is written
        const script = iframeDoc.createElement('script');
        script.textContent = `
// Set up communication with parent window
window.addEventListener('message', function(event) {
    if (event.data.type === 'chatbot-response') {
        formatResponseWithCodeBlocks(document.getElementById('response-output'), event.data.response);
    }
});

// Set up button click handler
document.getElementById('ask-button').addEventListener('click', function() {
    const question = document.getElementById('question-input').value.trim();
    if (question) {
        document.getElementById('response-output').textContent = "Thinking...";
        // Send message to parent window
        window.parent.postMessage({
            type: 'chatbot-question',
            question: question
        }, '*');
    } else {
        document.getElementById('response-output').textContent = "Please enter a question.";
    }
});

// Add Enter key support
document.getElementById('question-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('ask-button').click();
    }
});

// Function to format response with code blocks
function formatResponseWithCodeBlocks(responseDiv, text) {
    // Clear the response div
    responseDiv.innerHTML = '';
    
    // Split the text by code blocks
    const parts = text.split(/\`\`\`(\w*)\n([\s\S]*?)\`\`\`/g);
    
    for (let i = 0; i < parts.length; i++) {
        if (i % 3 === 0) {
            // This is regular text
            if (parts[i].trim()) {
                const textNode = document.createElement('div');
                textNode.textContent = parts[i];
                responseDiv.appendChild(textNode);
            }
        } else if (i % 3 === 1) {
            // This is the language identifier
            const language = parts[i] || 'text';
            const code = parts[i + 1];
            
            // Create code block container
            const codeContainer = document.createElement('div');
            codeContainer.className = 'code-container';
            
            // Create language header
            const langHeader = document.createElement('div');
            langHeader.className = 'language-header';
            
            // Add language name
            const langName = document.createElement('span');
            langName.textContent = language.toUpperCase();
            langHeader.appendChild(langName);
            
            // Add copy button
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.textContent = 'Copy';
            copyButton.addEventListener('click', function() {
                // Copy code to clipboard
                navigator.clipboard.writeText(code).then(() => {
                    // Visual feedback
                    copyButton.textContent = 'Copied!';
                    copyButton.classList.add('copied');
                    
                    // Reset after 2 seconds
                    setTimeout(() => {
                        copyButton.textContent = 'Copy';
                        copyButton.classList.remove('copied');
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy code:', err);
                    copyButton.textContent = 'Error';
                    
                    // Reset after 2 seconds
                    setTimeout(() => {
                        copyButton.textContent = 'Copy';
                    }, 2000);
                });
            });
            langHeader.appendChild(copyButton);
            
            codeContainer.appendChild(langHeader);
            
            // Create code block
            const codeBlock = document.createElement('pre');
            codeBlock.className = "code-block code-" + language;
            
            // Apply syntax highlighting based on language
            if (language === 'java') {
                codeBlock.innerHTML = highlightJava(code);
            } else if (language === 'javascript' || language === 'js') {
                codeBlock.innerHTML = highlightJavaScript(code);
            } else if (language === 'python' || language === 'py') {
                codeBlock.innerHTML = highlightPython(code);
            } else if (language === 'css') {
                codeBlock.innerHTML = highlightCSS(code);
            } else if (language === 'html') {
                codeBlock.innerHTML = highlightHTML(code);
            } else if (language === 'sql') {
                codeBlock.innerHTML = highlightSQL(code);
            } else if (language === 'c' || language === 'cpp') {
                codeBlock.innerHTML = highlightC(code);
            } else {
                codeBlock.textContent = code;
            }
            
            codeContainer.appendChild(codeBlock);
            responseDiv.appendChild(codeContainer);
            
            // Skip the next part as we've already processed it
            i++;
        }
    }
}

// Syntax highlighting functions
function highlightJava(code) {
    return code
        .replace(/\\b(public|private|protected|class|static|void|int|double|float|boolean|String|if|else|for|while|return|new|null|true|false)\\b/g, '<span class="keyword">$1</span>')
        .replace(/(\\/\\/.*)/g, '<span class="comment">$1</span>')
        .replace(/(\/\\*[\\s\\S]*?\\*\\/)/g, '<span class="comment">$1</span>')
        .replace(/(".*?")/g, '<span class="string">$1</span>')
        .replace(/\\b([0-9]+(\\.[0-9]+)?)\\b/g, '<span class="number">$1</span>');
}

function highlightJavaScript(code) {
    return code
        .replace(/\\b(var|let|const|function|return|if|else|for|while|do|switch|case|break|continue|new|this|typeof|instanceof|null|undefined|true|false)\\b/g, '<span class="keyword">$1</span>')
        .replace(/(\\/\\/.*)/g, '<span class="comment">$1</span>')
        .replace(/(\/\\*[\\s\\S]*?\\*\\/)/g, '<span class="comment">$1</span>')
        .replace(/(".*?")|('.*?')|(\`.*?\`)/g, '<span class="string">$1</span>')
        .replace(/\\b([0-9]+(\\.[0-9]+)?)\\b/g, '<span class="number">$1</span>');
}

function highlightPython(code) {
    return code
        .replace(/\\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|in|is|not|and|or|True|False|None)\\b/g, '<span class="keyword">$1</span>')
        .replace(/(#.*)/g, '<span class="comment">$1</span>')
        .replace(/(".*?")|('.*?')|(\`.*?\`)/g, '<span class="string">$1</span>')
        .replace(/\\b([0-9]+(\\.[0-9]+)?)\\b/g, '<span class="number">$1</span>');
}

function highlightCSS(code) {
    return code
        .replace(/([\\w-]+)(?=\\s*:)/g, '<span class="property">$1</span>')
        .replace(/(:.*?;)/g, '<span class="value">$1</span>')
        .replace(/(\/\\*[\\s\\S]*?\\*\\/)/g, '<span class="comment">$1</span>')
        .replace(/(#[\\w-]+|\\.[\w-]+)/g, '<span class="selector">$1</span>');
}

function highlightHTML(code) {
    return code
        .replace(/(&lt;[\\/]?)([\\w-]+)/g, '$1<span class="tag">$2</span>')
        .replace(/(\\s+)([\\w-]+)(?=\\s*=)/g, '$1<span class="attribute">$2</span>')
        .replace(/(".*?")|('.*?')/g, '<span class="string">$1</span>');
}

function highlightSQL(code) {
    return code
        .replace(/\\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|AND|OR|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP BY|ORDER BY|HAVING|LIMIT|AS|ON|VALUES|SET|CREATE|TABLE|INDEX|VIEW|DROP|ALTER|ADD|COLUMN)\\b/gi, '<span class="keyword">$1</span>')
        .replace(/\\b(COUNT|SUM|AVG|MIN|MAX|CONCAT|SUBSTRING|TRIM|UPPER|LOWER)\\b/gi, '<span class="function">$1</span>')
        .replace(/\\b([0-9]+(\\.[0-9]+)?)\\b/g, '<span class="number">$1</span>')
        .replace(/(--.*)/g, '<span class="comment">$1</span>')
        .replace(/(\/\\*[\\s\\S]*?\\*\\/)/g, '<span class="comment">$1</span>')
        .replace(/(".*?")|('.*?')/g, '<span class="string">$1</span>');
}

function highlightC(code) {
    return code
        .replace(/\\b(int|char|float|double|void|struct|union|enum|typedef|const|static|extern|register|auto|volatile|unsigned|signed|short|long|if|else|for|while|do|switch|case|break|continue|return|goto|sizeof)\\b/g, '<span class="keyword">$1</span>')
        .replace(/(\\/\\/.*)/g, '<span class="comment">$1</span>')
        .replace(/(\/\\*[\\s\\S]*?\\*\\/)/g, '<span class="comment">$1</span>')
        .replace(/(#include|#define|#ifdef|#ifndef|#endif|#pragma|#if|#else|#elif)\\b/g, '<span class="preprocessor">$1</span>')
        .replace(/(".*?")/g, '<span class="string">$1</span>')
        .replace(/\\b([0-9]+(\\.[0-9]+)?)\\b/g, '<span class="number">$1</span>');
}
`;
        
        iframeDoc.body.appendChild(script);
        
        // Set up message listener for iframe communication
        window.addEventListener('message', function(event) {
            if (event.data.type === 'chatbot-question') {
                askChatbot(event.data.question).then(response => {
                    iframe.contentWindow.postMessage({
                        type: 'chatbot-response',
                        response: response
                    }, '*');
                }).catch(error => {
                    iframe.contentWindow.postMessage({
                        type: 'chatbot-response',
                        response: 'Error: ' + error.message
                    }, '*');
                });
            }
        });
        
        console.log("[Chatbot] Iframe fallback created");
    }

    // Initialiser l'interface une fois au démarrage
    console.log("[Chatbot] Starting initial interface setup...");
    init();

    // Observer les changements d'URL pour réinitialiser lors de la navigation dans les SPA
    console.log("[Chatbot] Setting up URL change observer...");
    // Delay URL observer setup to ensure document.body exists
    setTimeout(observeUrlChanges, 1000);

    // Ajouter des raccourcis clavier
    document.addEventListener("keydown", function (e) {
        // Basculer la visibilité avec Meta+Shift+K (macOS) ou Ctrl+Alt+K (Windows)
        if ((e.metaKey && e.shiftKey || e.ctrlKey && e.altKey) && e.key.toLowerCase() === "k") {
            console.log("[Chatbot] Keyboard shortcut triggered for toggle visibility");
            e.preventDefault();
            toggleChatbotInterface();
        }

        // Augmenter l'opacité avec Meta+Shift+↑ (macOS) ou Ctrl+Alt+↑ (Windows)
        if ((e.metaKey && e.shiftKey || e.ctrlKey && e.altKey) && e.key === "ArrowUp") {
            e.preventDefault();
            adjustOpacity(0.1);
        }

        // Diminuer l'opacité avec Meta+Shift+↓ (macOS) ou Ctrl+Alt+↓ (Windows)
        if ((e.metaKey && e.shiftKey || e.ctrlKey && e.altKey) && e.key === "ArrowDown") {
            e.preventDefault();
            adjustOpacity(-0.1);
        }

        // Fallback to iframe with Meta+Shift+I (macOS) or Ctrl+Alt+I (Windows)
        if ((e.metaKey && e.shiftKey || e.ctrlKey && e.altKey) && e.key.toLowerCase() === "i") {
            e.preventDefault();
            createIframeFallback();
        }
    }, { passive: false });
    
    // Add a periodic check to ensure our container is still in the DOM
    setInterval(() => {
        const hostExists = document.querySelector(`#${CHATBOT_ID}`) || document.querySelector('[data-chatbot-host="true"]');
        if (!hostExists && document.body) {
            console.log("[Chatbot] Host element not found, reinitializing...");
            chatbotInitialized = false;
            initializeChatbot();
        }
    }, 2000);
    
    // Add a fallback check - if after 30 seconds we still can't keep the element in the DOM, try the iframe approach
    setTimeout(() => {
        const hostExists = document.querySelector(`#${CHATBOT_ID}`) || document.querySelector('[data-chatbot-host="true"]');
        if (!hostExists) {
            console.log("[Chatbot] Unable to maintain element in DOM, creating iframe fallback...");
            createIframeFallback();
        }
    }, 30000);
    
    console.log("[Chatbot] Script initialization completed");
})();

