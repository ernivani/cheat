// ==UserScript==
// @name         Chatbot via Ollama Local API
// @namespace    http://tampermonkey.net/
// @version      2024-10-25
// @description  Ask Chatbot model questions via Ollama local API
// @author       ernicani
// @match        *://*/*
// @grant        none
// ==/UserScript==
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

    let container; // Déclarer le conteneur dans la portée globale
    let currentOpacity = 1.0; // Opacité par défaut

    // Fonction pour initialiser l'interface Chatbot
    function initializeChatbotInterface() {
        // Vérifier si le script a déjà été injecté sur cette page
        if (document.getElementById("chatbot-container")) {
            return; // Ne rien faire si le conteneur existe déjà
        }

        // Créer un conteneur pour le bouton et l'entrée
        container = document.createElement("div");
        container.id = "chatbot-container"; // Ajouter un ID pour référence future
        container.style.position = "fixed";
        container.style.bottom = "20px";
        container.style.right = "20px";
        container.style.zIndex = "9999";
        container.style.padding = "10px";
        container.style.backgroundColor = "white";
        container.style.border = "1px solid #ccc";
        container.style.width = "320px"; // Ajuster la largeur pour les barres de défilement
        container.style.opacity = currentOpacity; // Définir l'opacité initiale
        container.style.display = "None";

        // Créer le bouton pour déclencher la conversation Chatbot
        const button = document.createElement("button");
        button.innerText = "Ask Chatbot";
        button.style.padding = "10px 20px";
        button.style.backgroundColor = "#4CAF50";
        button.style.color = "white";
        button.style.border = "none";
        button.style.cursor = "pointer";
        container.appendChild(button);

        // Créer une zone de texte pour la saisie utilisateur
        const textarea = document.createElement("textarea");
        textarea.placeholder = "Ask Chatbot something...";
        textarea.style.width = "300px";
        textarea.style.height = "100px";
        textarea.style.marginTop = "10px";
        container.appendChild(textarea);

        // Créer un div pour afficher la réponse de Chatbot
        const responseDiv = document.createElement("div");
        responseDiv.style.marginTop = "10px";
        responseDiv.style.width = "300px";
        responseDiv.style.maxHeight = "300px"; // Définir une hauteur maximale
        responseDiv.style.overflow = "auto"; // Activer le défilement
        responseDiv.style.border = "1px solid #ccc";
        responseDiv.style.padding = "10px";
        responseDiv.style.whiteSpace = "pre-wrap"; // Préserver les espaces et les sauts de ligne
        responseDiv.style.color = "black";
        container.appendChild(responseDiv);

        // Ajouter le conteneur au corps du document
        document.body.appendChild(container);

        // Ajouter des styles personnalisés pour le formatage du code
        const style = document.createElement("style");
        style.textContent = `
            .chatbot-response pre {
                background-color: #f6f8fa;
                padding: 10px;
                overflow: auto;
                max-height: 400px;
                border: 1px solid #ddd;
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            .chatbot-response code {
                background-color: #f6f8fa;
                padding: 2px 4px;
                font-family: monospace;
                border-radius: 3px;
            }
        `;
        document.head.appendChild(style);

        // Fonction pour formater la réponse
        function formatResponse(response) {
            // Échapper les entités HTML pour prévenir les attaques XSS
            response = response
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            // Convertir les blocs de code (```code```) en <pre><code>...</code></pre>
            response = response.replace(/```(.*?)```/gs, function (match, p1) {
                return "<pre><code>" + p1 + "</code></pre>";
            });

            // Convertir le code en ligne (`code`) en <code>...</code>
            response = response.replace(/`([^`]+)`/g, "<code>$1</code>");

            // Convertir les titres markdown (# Titre)
            response = response.replace(/^(#{1,6})\s(.+)$/gm, function(match, hashes, title) {
                const level = hashes.length;
                return `<h${level}>${title}</h${level}>`;
            });

            // Convertir les listes à puces
            response = response.replace(/^\*\s(.+)$/gm, '<li>$1</li>');
            response = response.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

            // Convertir les liens markdown [texte](url)
            response = response.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

            // Convertir le texte en gras **texte**
            response = response.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

            // Convertir le texte en italique *texte*
            response = response.replace(/\*([^*]+)\*/g, '<em>$1</em>');

            // Convertir les sauts de ligne en <br> pour les sauts de ligne appropriés
            response = response.replace(/\n/g, "<br>");

            return response;
        }

        // Fonction pour appeler votre API Node.js et obtenir la réponse de Chatbot
        async function askChatbot(prompt) {
            try {
                const response = await fetch("https://localhost:3000/ask", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: new URLSearchParams({ prompt }),
                });

                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }

                const reader = response.body.getReader();
                let fullResponse = "";
                const decoder = new TextDecoder();
                
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    
                    // Decode the chunk and split by SSE data markers
                    const text = decoder.decode(value);
                    const lines = text.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.error) {
                                    throw new Error(data.error);
                                }
                                if (!data.done) {
                                    fullResponse += data.text;
                                    // Update the response div with the accumulated text
                                    responseDiv.innerHTML = formatResponse(fullResponse);
                                    // Scroll to bottom to show new content
                                    responseDiv.scrollTop = responseDiv.scrollHeight;
                                }
                            } catch (e) {
                                console.error("Error parsing SSE data:", e);
                            }
                        }
                    }
                }
                
                return fullResponse;
            } catch (error) {
                throw error;
            }
        }

        // Déclencher l'appel API lorsque le bouton est cliqué
        button.addEventListener("click", async function () {
            const question = textarea.value.trim() + getSelectionText();
            if (question) {
                responseDiv.innerText = "Thinking...";
                responseDiv.classList.add("chatbot-response");

                try {
                    await askChatbot(question);
                } catch (err) {
                    responseDiv.innerText = "Error: " + err.message;
                }
            } else {
                responseDiv.innerText = "Please enter a question.";
            }
        });
    }

    // Fonction pour basculer la visibilité de l'interface Chatbot
    function toggleChatbotInterface() {
        if (container) {
            if (container.style.display === "none") {
                container.style.display = "block";
            } else {
                container.style.display = "none";
            }
        } else {
            initializeChatbotInterface();
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
        new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                // L'URL a changé, réinitialiser l'interface Chatbot
                initializeChatbotInterface();
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    // Initialiser l'interface une fois au démarrage
    initializeChatbotInterface();

    // Observer les changements d'URL pour réinitialiser lors de la navigation dans les SPA
    observeUrlChanges();

    // Ajouter des raccourcis clavier
    document.addEventListener("keydown", function (e) {
        // Basculer la visibilité avec Meta+Shift+K (macOS) ou Ctrl+Alt+K (Windows)
        if ((e.metaKey && e.shiftKey || e.ctrlKey && e.altKey) && e.key.toLowerCase() === "k") {
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

        if (e.key === "Enter") {
            e.preventDefault();
            button.click();
        }
    });
})();
