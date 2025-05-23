'use strict';

// Chrome Runtime API compatibility wrapper
const chromeRuntime = {
  sendMessage: function(message, callback) {
    try {
      if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        return chrome.runtime.sendMessage(message, callback);
      } else if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
        // Firefox compatibility
        return browser.runtime.sendMessage(message).then(
          response => callback(response),
          error => {
            console.error('Browser runtime error:', error);
            callback({ success: false, error: error.message || 'Browser runtime error' });
          }
        );
      } else {
        console.error('No runtime API available');
        setTimeout(() => callback({ success: false, error: 'Runtime API not available' }), 0);
      }
    } catch (e) {
      console.error('Error in sendMessage:', e);
      setTimeout(() => callback({ success: false, error: e.message || 'Unknown error in sendMessage' }), 0);
    }
  }
};

console.log('Blocker & Mistral API extension loaded! Use Command+K (Mac) or Ctrl+K (Windows) on selected text to ask general questions. Use Ctrl+J to analyze and fill HTML forms.');

// Function to set cursor style
function setCursorStyle(style) {
  document.body.style.cursor = style;
}

// Function to copy text to clipboard
function copyTextToClipboard(text) {
  try {
    console.log('Attempting to copy to clipboard:', text.substring(0, 50) + '...');
    const textarea = document.createElement('textarea');
    textarea.textContent = text;
    textarea.style.position = 'fixed'; // Prevent scrolling to bottom of page
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    console.log('Copy successful:', success);
    return success;
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    return false;
  }
}

// Helper function to send prompt to Mistral API via background script
function askMistralViaBackground(prompt) {
  console.log('Sending prompt to background for Mistral:', prompt.substring(0, 70) + '...');
  return new Promise((resolve, reject) => {
    try {
      chromeRuntime.sendMessage({ action: 'askMistral', prompt: prompt }, response => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message to background:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          console.log('Received response from background for Mistral: ' + response.data);
          resolve(response.data);
        } else {
          const errorMessage = response && response.error ? response.error : 'Unknown error from background';
          console.error('Failed to get response from background for Mistral:', errorMessage);
          reject(new Error(errorMessage));
        }
      });
    } catch (e) {
      console.error('Error in askMistralViaBackground:', e);
      reject(new Error(e.message || 'Unknown error in askMistralViaBackground'));
    }
  });
}

// --- Start of UserScript Ported Logic ---

function extractPureJsCode(responseText) {
    if (!responseText) return null;
    let match = responseText.match(/```javascript\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return match[1].trim();
    }
    match = responseText.match(/```\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
        return match[1].trim();
    }
    return null;
}

// Function to manually execute JS code for QCM questions
function executeQcmJsWithoutEval(checkboxes, jsCodeResponse) {
    // Check if the code matches the pattern of selecting a specific checkbox
    const indexMatch = jsCodeResponse.match(/checkboxes\[(\d+)\]\.checked\s*=\s*true/);
    if (indexMatch && indexMatch[1]) {
        const index = parseInt(indexMatch[1], 10);
        if (index >= 0 && index < checkboxes.length) {
            // Uncheck all checkboxes first
            checkboxes.forEach(cb => { cb.checked = false; });
            
            // Check the specified checkbox
            checkboxes[index].checked = true;
            const event = new Event('change', { bubbles: true });
            checkboxes[index].dispatchEvent(event);
            return true;
        }
    }
    
    // If code contains a specific option indication
    for (let i = 0; i < 4; i++) {
        if (jsCodeResponse.includes(`checkboxes[${i}].checked = true`) || 
            jsCodeResponse.includes(`checkboxes.${i}.checked = true`) ||
            jsCodeResponse.includes(`checkboxes[${i}]`) || 
            jsCodeResponse.toLowerCase().includes(`option ${i+1}`) ||
            jsCodeResponse.includes(`index ${i}`)) {
            
            // Uncheck all checkboxes
            checkboxes.forEach(cb => { cb.checked = false; });
            
            // Check the identified checkbox
            if (i < checkboxes.length) {
                checkboxes[i].checked = true;
                const event = new Event('change', { bubbles: true });
                checkboxes[i].dispatchEvent(event);
                return true;
            }
        }
    }
    
    // Check for patterns like "La réponse correcte est B" or "option B"
    const letterMatch = jsCodeResponse.match(/r[ée]ponse.*?([A-D])|option\s+([A-D])/i);
    if (letterMatch) {
        const letter = (letterMatch[1] || letterMatch[2]).toUpperCase();
        const index = letter.charCodeAt(0) - 'A'.charCodeAt(0);
        
        if (index >= 0 && index < checkboxes.length) {
            // Uncheck all checkboxes
            checkboxes.forEach(cb => { cb.checked = false; });
            
            // Check the specified checkbox
            checkboxes[index].checked = true;
            const event = new Event('change', { bubbles: true });
            checkboxes[index].dispatchEvent(event);
            return true;
        }
    }
    
    return false;
}

// Function to show notification with response (by copying to clipboard)
function showMistralResponse(response) {
    copyTextToClipboard(response);
    try {
      chromeRuntime.sendMessage({
          action: 'showNotification',
          text: 'Response copied to clipboard!'
      }, () => {});
    } catch (e) {
      console.error('Error showing notification:', e);
    }
}

function getInteractiveElementLabel(element, blockScope = document) {
    let labelText = '';
    if (element.id) {
        const forLabel = blockScope.querySelector(`label[for="${element.id}"]`);
        if (forLabel) labelText = forLabel.textContent.trim();
    }
    if (!labelText && element.closest('label')) {
        const parentLabel = element.closest('label');
        const clone = parentLabel.cloneNode(true);
        let inputInClone = null;
        if (element.id) inputInClone = clone.querySelector(`#${element.id}`);
        if (!inputInClone && element.name && element.value) inputInClone = clone.querySelector(`[name="${element.name}"][value="${element.value}"]`);
        if (!inputInClone) inputInClone = clone.querySelector(element.tagName.toLowerCase());
        if (inputInClone) inputInClone.remove();
        labelText = clone.textContent.trim();
    }
    if (!labelText) labelText = element.getAttribute('aria-label');
    if (!labelText && element.getAttribute('aria-labelledby')) {
        const labelledByElem = document.getElementById(element.getAttribute('aria-labelledby'));
        if (labelledByElem) labelText = labelledByElem.textContent.trim();
    }
    if (!labelText) {
        labelText = element.value || (element.name ? `${element.name} option` : `Option`);
    }
    return labelText;
}

async function analyzeHtml() {
    try {
        // First check for the activity blocks with ID starting with 'activity-'
        const activityBlocks = document.querySelectorAll('[id^="activity-"]');
        if (!activityBlocks || activityBlocks.length === 0) {
            try {
                chromeRuntime.sendMessage({ 
                    action: 'showNotification', 
                    text: 'No activity blocks found on the page.' 
                }, () => {});
            } catch (e) {
                console.error('Error showing notification:', e);
            }
            throw new Error('No activity blocks found on the page');
        }

        for (const block of activityBlocks) {
            console.log(`Processing block: ${block.id || 'N/A'}`);
            
            // First try to find questions in the new QCM format
            const qcmQuestions = Array.from(block.querySelectorAll('[data-v-96b14dde]')).filter(el => 
                el.querySelector('h3.font-weight-bold') && 
                el.querySelectorAll('input[type="checkbox"]').length > 0
            );
            
            if (qcmQuestions && qcmQuestions.length > 0) {
                console.log(`Found ${qcmQuestions.length} QCM questions in block ${block.id}`);
                
                for (const qcmQuestion of qcmQuestions) {
                    const questionElement = qcmQuestion.querySelector('h3.font-weight-bold');
                    if (!questionElement) continue;
                    
                    const questionText = questionElement.textContent.trim();
                    if (!questionText) continue;
                    
                    console.log(`Processing QCM question: "${questionText.substring(0, 40)}..."`);
                    
                    const checkboxes = Array.from(qcmQuestion.querySelectorAll('input[type="checkbox"]'));
                    if (checkboxes.length === 0) continue;
                    
                    const checkboxOptions = checkboxes.map(cb => ({
                        element: cb, 
                        label: cb.nextElementSibling ? cb.nextElementSibling.textContent.trim() : ""
                    }));
                    
                    const optionLabels = checkboxOptions.map(opt => opt.label);
                    const prompt = `For the multiple choice question: "${questionText}", which of these options is correct? Options: ${optionLabels.join('; ')}. Choose only one option and respond with the exact label of the correct answer.`;
                    
                    const llmResponse = await askMistralViaBackground(prompt);
                    if (llmResponse) {
                        console.log(`AI response for QCM: "${llmResponse.substring(0, 50)}..."`);
                        
                        // Find the checkbox that matches the response
                        let selectedOption = checkboxOptions.find(opt => 
                            opt.label.toLowerCase() === llmResponse.trim().toLowerCase()
                        );
                        
                        // If no exact match, try to find a fuzzy match
                        if (!selectedOption) {
                            for (const option of checkboxOptions) {
                                if (llmResponse.toLowerCase().includes(option.label.toLowerCase()) || 
                                    option.label.toLowerCase().includes(llmResponse.trim().toLowerCase())) {
                                    selectedOption = option;
                                    break;
                                }
                            }
                        }
                        
                        if (selectedOption) {
                            // Uncheck all checkboxes in this question
                            checkboxes.forEach(cb => { cb.checked = false; });
                            
                            // Check the selected option
                            selectedOption.element.checked = true;
                            const event = new Event('change', { bubbles: true });
                            selectedOption.element.dispatchEvent(event);
                            console.log(`Selected option: "${selectedOption.label.substring(0, 30)}..."`);
                        } else {
                            console.log(`Could not find a matching option for response: "${llmResponse}"`);
                            
                            // Extract specific answer patterns from the response
                            let handled = false;
                            
                            // Check for number patterns like "3" or "option 3"
                            const numberMatch = llmResponse.match(/(\d+)[.:\s]/);
                            if (numberMatch) {
                                const num = parseInt(numberMatch[1], 10);
                                // If the number seems to be referring to the answer number and is in range
                                if (num > 0 && num <= checkboxes.length) {
                                    checkboxes.forEach(cb => { cb.checked = false; });
                                    checkboxes[num - 1].checked = true;
                                    const event = new Event('change', { bubbles: true });
                                    checkboxes[num - 1].dispatchEvent(event);
                                    handled = true;
                                    console.log(`Selected option by number: ${num}`);
                                }
                            }
                            
                            // Check for letter patterns like "B" or "option B"
                            if (!handled) {
                                const letterMatch = llmResponse.match(/([A-D])[.:\s]/i);
                                if (letterMatch) {
                                    const letter = letterMatch[1].toUpperCase();
                                    const index = letter.charCodeAt(0) - 'A'.charCodeAt(0);
                                    if (index >= 0 && index < checkboxes.length) {
                                        checkboxes.forEach(cb => { cb.checked = false; });
                                        checkboxes[index].checked = true;
                                        const event = new Event('change', { bubbles: true });
                                        checkboxes[index].dispatchEvent(event);
                                        handled = true;
                                        console.log(`Selected option by letter: ${letter}`);
                                    }
                                }
                            }
                            
                            // If still no match, try an advanced prompt
                            if (!handled) {
                                const checkboxDetails = checkboxOptions.map((opt, idx) => 
                                    `Choice ${idx+1}: "${opt.label.replace(/"/g, '\\"')}"`
                                ).join(', ');
                                
                                const jsPrompt = `Question: "${questionText}". 
Options: ${checkboxDetails}. 
Based on the question, which numerical option (1, 2, 3, 4, etc.) is correct? 
Answer with ONLY the number of the correct option, nothing else.`;
                                
                                const indexResponse = await askMistralViaBackground(jsPrompt);
                                console.log(`AI index response: "${indexResponse}"`);
                                
                                // Extract just the number from the response
                                const indexMatch = indexResponse.match(/(\d+)/);
                                if (indexMatch) {
                                    const index = parseInt(indexMatch[1], 10) - 1; // Convert to 0-based index
                                    if (index >= 0 && index < checkboxes.length) {
                                        checkboxes.forEach(cb => { cb.checked = false; });
                                        checkboxes[index].checked = true;
                                        const event = new Event('change', { bubbles: true });
                                        checkboxes[index].dispatchEvent(event);
                                        handled = true;
                                        console.log(`Selected option by index response: ${index + 1}`);
                                    }
                                }
                            }
                        }
                    }
                }
                
                continue; // Skip the old format checks for this block since we handled the QCM
            }
            
            // Continue with the original format
            const questionContentElement = block.querySelector('.html-content');
            if (!questionContentElement) {
                console.log(`No .html-content found in block ${block.id || 'N/A'}`);
                continue;
            }

            const questionText = questionContentElement.textContent.trim();
            if (!questionText) {
                console.log(`No question text found in .html-content for block ${block.id || 'N/A'}`);
                continue;
            }

            let actionPerformed = false;

            // 1. Text editor (contenteditable)
            const textEditor = block.querySelector('.text-editor[contenteditable="true"]');
            if (textEditor) {
                console.log(`Found text editor for: "${questionText}"`);
                const prompt = `Answer the following question: ${questionText}`;
                const answer = await askMistralViaBackground(prompt);
                if (answer) {
                    textEditor.innerHTML = `<div>${answer.replace(/\n/g, '<br>')}</div>`;
                    const event = new Event('input', { bubbles: true });
                    textEditor.dispatchEvent(event);
                    actionPerformed = true;
                }
            }

            // 2. Textarea
            if (!actionPerformed) {
                const textarea = block.querySelector('textarea');
                if (textarea && textarea !== textEditor ) {
                    console.log(`Found textarea for: "${questionText}"`);
                    const prompt = `Answer the following question: ${questionText}`;
                    const answer = await askMistralViaBackground(prompt);
                    if (answer) {
                        textarea.value = answer;
                        const event = new Event('input', { bubbles: true });
                        textarea.dispatchEvent(event);
                        actionPerformed = true;
                    }
                }
            }

            // 3. Text input
            if (!actionPerformed) {
                const textInput = block.querySelector('input[type="text"]:not([readonly])');
                 if (textInput) {
                    console.log(`Found text input for: "${questionText}"`);
                    const prompt = `Answer the following question: ${questionText}`;
                    const answer = await askMistralViaBackground(prompt);
                    if (answer) {
                        textInput.value = answer;
                        const event = new Event('input', { bubbles: true });
                        textInput.dispatchEvent(event);
                        actionPerformed = true;
                    }
                }
            }

            // 4. Select dropdown (replace eval usage)
            if (!actionPerformed) {
                const selectElement = block.querySelector('select');
                if (selectElement) {
                    console.log(`Found select for: "${questionText}"`);
                    const options = Array.from(selectElement.options)
                                         .map(opt => opt.text.trim())
                                         .filter(optText => optText.length > 0);
                    if (options.length > 0) {
                        const prompt = `For the question "${questionText}", choose the most appropriate option from the following: ${options.join('; ')}. Respond with only the chosen option text.`;
                        const answer = await askMistralViaBackground(prompt);
                        if (answer) {
                            const selectedOption = Array.from(selectElement.options).find(
                                opt => opt.text.trim().toLowerCase() === answer.trim().toLowerCase()
                            );
                            if (selectedOption) {
                                selectElement.value = selectedOption.value;
                                const event = new Event('change', { bubbles: true });
                                selectElement.dispatchEvent(event);
                                actionPerformed = true;
                            } else if (answer) {
                                console.log(`Initial select option match failed. AI answer: "${answer}". Attempting direct approach.`);
                                
                                // Try to find a fuzzy match
                                const fuzzyOption = Array.from(selectElement.options).find(
                                    opt => opt.text.trim().toLowerCase().includes(answer.trim().toLowerCase()) ||
                                          answer.trim().toLowerCase().includes(opt.text.trim().toLowerCase())
                                );
                                
                                if (fuzzyOption) {
                                    selectElement.value = fuzzyOption.value;
                                    const event = new Event('change', { bubbles: true });
                                    selectElement.dispatchEvent(event);
                                    actionPerformed = true;
                                } else {
                                    // If fuzzy match failed, try another prompt that returns just an index
                                    const optionsDetails = Array.from(selectElement.options).map((opt, i) => 
                                        `Option ${i+1}: "${opt.text.trim().replace(/"/g, '\\"')}"`
                                    ).join(', ');
                                    
                                    const indexPrompt = `Question: "${questionText}"
Available options: ${optionsDetails}
Based on the question, which numerical option (1, 2, 3, etc.) is the correct answer?
Reply with ONLY the number of the correct option, nothing else.`;
                                    
                                    const indexResponse = await askMistralViaBackground(indexPrompt);
                                    console.log(`AI index response for select: "${indexResponse}"`);
                                    
                                    const indexMatch = indexResponse.match(/(\d+)/);
                                    if (indexMatch) {
                                        const index = parseInt(indexMatch[1], 10) - 1; // Convert to 0-based index
                                        if (index >= 0 && index < selectElement.options.length) {
                                            selectElement.selectedIndex = index;
                                            const event = new Event('change', { bubbles: true });
                                            selectElement.dispatchEvent(event);
                                            actionPerformed = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 5. Checkboxes (original format)
            if (!actionPerformed) {
                const checkboxes = Array.from(block.querySelectorAll('input[type="checkbox"]'));
                if (checkboxes.length === 1) {
                    const checkbox = checkboxes[0];
                    console.log(`Found single checkbox for: "${questionText}"`);
                    const prompt = `For the statement: "${questionText}", should this be checked? Answer "Yes" or "No".`;
                    const answer = await askMistralViaBackground(prompt);
                    if (answer) {
                        const prevChecked = checkbox.checked;
                        if (answer.trim().toLowerCase() === 'yes') checkbox.checked = true;
                        else if (answer.trim().toLowerCase() === 'no') checkbox.checked = false;
                        if (checkbox.checked !== prevChecked) {
                            const event = new Event('change', { bubbles: true });
                            checkbox.dispatchEvent(event);
                        }
                        actionPerformed = true;
                    }
                } else if (checkboxes.length > 1) {
                    console.log(`Found multiple checkboxes for: "${questionText}"`);
                    const checkboxOptions = checkboxes.map(cb => ({element: cb, label: getInteractiveElementLabel(cb, block)}));
                    if (checkboxOptions.length > 0) {
                        const optionLabels = checkboxOptions.map(opt => opt.label);
                        const prompt = `For "${questionText}", which options should be selected? Options: ${optionLabels.join('; ')}. Respond with a semicolon-separated list of exact labels. If none, respond "None".`;
                        const llmResponse = await askMistralViaBackground(prompt);
                        if (llmResponse) {
                            const selectedLabels = llmResponse.trim().toLowerCase() === 'none' ? [] : llmResponse.split(';').map(s => s.trim().toLowerCase());
                            let madeChange = false;
                            checkboxOptions.forEach(opt => {
                                const shouldBeChecked = selectedLabels.includes(opt.label.toLowerCase());
                                if (opt.element.checked !== shouldBeChecked) {
                                   opt.element.checked = shouldBeChecked;
                                   madeChange = true;
                                   const event = new Event('change', { bubbles: true });
                                   opt.element.dispatchEvent(event);
                                }
                            });
                            if (madeChange) actionPerformed = true;
                            else if (llmResponse && llmResponse.trim().toLowerCase() !== 'none') {
                                console.log(`Initial checkbox match failed. AI response: "${llmResponse}". Trying direct approach.`);
                                
                                // Try to find fuzzy matches for each part of the response
                                const responseParts = llmResponse.split(/[;,.]+/).map(part => part.trim().toLowerCase()).filter(p => p.length > 0);
                                let foundMatch = false;
                                
                                for (const part of responseParts) {
                                    // Skip very short parts or common words
                                    if (part.length < 3 || ['the', 'and', 'for', 'yes', 'no'].includes(part)) continue;
                                    
                                    for (const option of checkboxOptions) {
                                        if (option.label.toLowerCase().includes(part) || 
                                            part.includes(option.label.toLowerCase())) {
                                            option.element.checked = true;
                                            const event = new Event('change', { bubbles: true });
                                            option.element.dispatchEvent(event);
                                            foundMatch = true;
                                            madeChange = true;
                                        }
                                    }
                                }
                                
                                if (foundMatch) {
                                    actionPerformed = true;
                                } else {
                                    // Try index-based approach
                                    const checkboxDetails = checkboxOptions.map((opt, i) => 
                                        `Option ${i+1}: "${opt.label.replace(/"/g, '\\"')}"`
                                    ).join(', ');
                                    
                                    const indexPrompt = `Question: "${questionText}"
Available options: ${checkboxDetails}
Which options should be selected? Reply with ONLY the numbers of correct options separated by commas (e.g., "1,3" or "2").`;
                                    
                                    const indexResponse = await askMistralViaBackground(indexPrompt);
                                    console.log(`AI index response for checkboxes: "${indexResponse}"`);
                                    
                                    const numbers = indexResponse.match(/\d+/g);
                                    if (numbers && numbers.length > 0) {
                                        // Reset all checkboxes
                                        checkboxes.forEach(cb => { cb.checked = false; });
                                        
                                        // Check the ones indicated by numbers
                                        numbers.forEach(numStr => {
                                            const idx = parseInt(numStr, 10) - 1; // Convert to 0-based index
                                            if (idx >= 0 && idx < checkboxes.length) {
                                                checkboxes[idx].checked = true;
                                                const event = new Event('change', { bubbles: true });
                                                checkboxes[idx].dispatchEvent(event);
                                                madeChange = true;
                                            }
                                        });
                                        
                                        if (madeChange) actionPerformed = true;
                                    }
                                }
                            } else { actionPerformed = true; } // 'none' is a valid handled case
                        }
                    }
                }
            }

            // 6. Radio buttons (replace eval usage)
            if (!actionPerformed) {
                const radioGroups = {};
                block.querySelectorAll('input[type="radio"]').forEach(radio => {
                    if (!radio.name) return;
                    if (!radioGroups[radio.name]) radioGroups[radio.name] = [];
                    radioGroups[radio.name].push({element: radio, label: getInteractiveElementLabel(radio, block)});
                });

                for (const groupName in radioGroups) {
                    if (actionPerformed) break;
                    const radiosInGroup = radioGroups[groupName];
                    if (radiosInGroup.length > 0) {
                        console.log(`Found radio group "${groupName}" for: "${questionText}"`);
                        const optionLabels = radiosInGroup.map(r => r.label);
                        const prompt = `For "${questionText}" (group "${groupName}"), choose one: ${optionLabels.join('; ')}. Respond with the exact label.`;
                        const answer = await askMistralViaBackground(prompt);
                        if (answer) {
                            const selectedRadio = radiosInGroup.find(r => r.label.trim().toLowerCase() === answer.trim().toLowerCase());
                            if (selectedRadio) {
                                selectedRadio.element.checked = true;
                                const event = new Event('change', { bubbles: true });
                                selectedRadio.element.dispatchEvent(event);
                                actionPerformed = true;
                            } else if (answer) {
                                console.log(`Initial radio match failed. AI: "${answer}". Group: ${groupName}. Trying fuzzy match.`);
                                
                                // Try fuzzy match first
                                const fuzzyMatch = radiosInGroup.find(r => 
                                    r.label.trim().toLowerCase().includes(answer.trim().toLowerCase()) ||
                                    answer.trim().toLowerCase().includes(r.label.trim().toLowerCase())
                                );
                                
                                if (fuzzyMatch) {
                                    fuzzyMatch.element.checked = true;
                                    const event = new Event('change', { bubbles: true });
                                    fuzzyMatch.element.dispatchEvent(event);
                                    actionPerformed = true;
                                } else {
                                    // Try an index-based approach
                                    const radioDetails = radiosInGroup.map((r, i) => 
                                        `Option ${i+1}: "${r.label.replace(/"/g, '\\"')}"`
                                    ).join(', ');
                                    
                                    const indexPrompt = `Question: "${questionText}" (group "${groupName}")
Available options: ${radioDetails}
Based on the question, which numerical option (1, 2, 3, etc.) is the correct answer?
Reply with ONLY the number of the correct option, nothing else.`;
                                    
                                    const indexResponse = await askMistralViaBackground(indexPrompt);
                                    console.log(`AI index response for radio: "${indexResponse}"`);
                                    
                                    const indexMatch = indexResponse.match(/(\d+)/);
                                    if (indexMatch) {
                                        const index = parseInt(indexMatch[1], 10) - 1; // Convert to 0-based index
                                        if (index >= 0 && index < radiosInGroup.length) {
                                            radiosInGroup[index].element.checked = true;
                                            const event = new Event('change', { bubbles: true });
                                            radiosInGroup[index].element.dispatchEvent(event);
                                            actionPerformed = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (actionPerformed) {
                console.log(`Action performed for: "${questionText.substring(0, 25)}..."`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait after action
            } else {
                console.log(`No actionable input found/filled for: "${questionText.substring(0,50)}..." in block ${block.id || 'N/A'}`);
            }
        }
        return true;
    } catch (error) {
        console.error('Error analyzing HTML:', error);
        try {
            chromeRuntime.sendMessage({ 
                action: 'showNotification', 
                text: 'Error analyzing HTML: ' + (error.message || 'Unknown error')
            }, () => {});
        } catch (e) {
            console.error('Error showing notification:', e);
        }
        return false;
    }
}
// --- End of UserScript Ported Logic ---


// Listen for messages from background script (e.g., for clipboard from a browser action)
try {
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Content script received message:', request.action);
    if (request.action === 'performCopy' && request.text) {
      const success = copyTextToClipboard(request.text);
      sendResponse({ success: success });
      console.log('Copy operation completed, success:', success);
    }
    return true; // Keep message channel open for async response
  });
} catch (e) {
  console.error('Error setting up message listener:', e);
}

// Handle keyboard shortcuts
document.addEventListener('keydown', async function(e) {
  // Ctrl+J or Cmd+J to analyze HTML and fill forms
  if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
    e.preventDefault();
    console.log('Ctrl+J: Analyzing HTML for form filling...');
    setCursorStyle('wait');
    try {
        chromeRuntime.sendMessage({ 
            action: 'showNotification', 
            text: 'Starting HTML Analysis...' 
        }, () => {});
    } catch (e) {
        console.error('Error showing notification:', e);
    }

    try {
      await analyzeHtml();
      try {
          chromeRuntime.sendMessage({ 
              action: 'showNotification', 
              text: 'HTML Analysis Complete!' 
          }, () => {});
      } catch (e) {
          console.error('Error showing notification:', e);
      }
    } catch (error) {
      console.error('Error during HTML analysis dispatch:', error);
      try {
          chromeRuntime.sendMessage({ 
              action: 'showNotification', 
              text: 'Error during HTML analysis: ' + (error.message || 'Unknown error') 
          }, () => {});
      } catch (e) {
          console.error('Error showing notification:', e);
      }
    } finally {
      setCursorStyle('default');
    }
  }

  // Check for Command+K (Mac) or Ctrl+K (Windows/Linux) for general Mistral query
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();

    const selectedText = window.getSelection().toString().trim();
    console.log('Ctrl+K: Selected text for Mistral query:', selectedText);

    if (!selectedText) {
      try {
          chromeRuntime.sendMessage({
              action: 'showNotification',
              text: 'Please select some text to ask Mistral.'
          }, () => {});
      } catch (e) {
          console.error('Error showing notification:', e);
      }
      return;
    }

    setCursorStyle('wait');
    try {
        chromeRuntime.sendMessage({ 
            action: 'showNotification', 
            text: 'Asking Mistral...' 
        }, () => {});
    } catch (e) {
        console.error('Error showing notification:', e);
    }

    try {
      const response = await askMistralViaBackground(selectedText);
      if (response) {
        showMistralResponse(response); // This copies to clipboard and shows notification
      } else {
        try {
            chromeRuntime.sendMessage({ 
                action: 'showNotification', 
                text: 'Failed to get response from Mistral' 
            }, () => {});
        } catch (e) {
            console.error('Error showing notification:', e);
        }
      }
    } catch (error) {
      console.error('Error asking Mistral via Ctrl+K:', error);
      try {
          chromeRuntime.sendMessage({ 
              action: 'showNotification', 
              text: 'Error: ' + (error.message || 'Failed to connect') 
          }, () => {});
      } catch (e) {
          console.error('Error showing notification:', e);
      }
    } finally {
      setCursorStyle('default');
    }
  }
});