const https = require("https");
const http = require("http"); // Used to interact with the API on localhost:11434
const fs = require("fs");
const path = require("path");

// Load the key and certificate files generated by mkcert or OpenSSL
const options = {
    key: fs.readFileSync(path.join(__dirname, "localhost-key.pem")),
    cert: fs.readFileSync(path.join(__dirname, "localhost.pem")),
};

// Function to interact with the Ollama API (or any other local API over HTTP)
function askMistral(prompt, callback) {
    const postData = JSON.stringify({
        model: "mistral",
        prompt: prompt,
        max_tokens: 150,
    });

    const reqOptions = {
        hostname: "localhost",
        port: 11434,
        path: "/api/generate",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
            // No 'Ollama-Stream' header means streaming is enabled by default
        },
    };

    const req = http.request(reqOptions, (res) => {
        res.setEncoding("utf8");

        let buffer = "";
        let responseText = "";

        res.on("data", (chunk) => {
            buffer += chunk;

            // Split the buffer by newlines to get complete JSON objects
            let lines = buffer.split("\n");
            buffer = lines.pop(); // Keep the last partial line for the next chunk

            lines.forEach((line) => {
                if (line.trim()) {
                    try {
                        let json = JSON.parse(line);
                        if (json.response) {
                            responseText += json.response;
                        }
                    } catch (e) {
                        console.error("Error parsing JSON line:", e);
                    }
                }
            });
        });

        res.on("end", () => {
            // Process any remaining data in the buffer
            if (buffer.trim()) {
                try {
                    let json = JSON.parse(buffer);
                    if (json.response) {
                        responseText += json.response;
                    }
                } catch (e) {
                    console.error("Error parsing JSON buffer at end:", e);
                }
            }
            // Return the aggregated response to the callback
            callback(null, { text: responseText });
        });
    });

    req.on("error", (err) => {
        callback(err, null);
    });

    req.write(postData);
    req.end();
}

// Create the HTTPS server
https
    .createServer(options, (req, res) => {
        if (req.method === "GET" && req.url === "/") {
            // Serve the HTML form (you can remove this if not needed)
            res.writeHead(200, { "Content-Type": "text/html" });
            res.write(`
            <html>
            <body>
                <h1>Chat with Mistral via HTTPS</h1>
                <form method="POST" action="/ask">
                    <label for="prompt">Ask something:</label><br>
                    <input type="text" id="prompt" name="prompt" required><br><br>
                    <input type="submit" value="Submit">
                </form>
            </body>
            </html>
        `);
            res.end();
        } else if (req.method === "POST" && req.url === "/ask") {
            let body = "";

            req.on("data", (chunk) => {
                body += chunk.toString();
            });

            req.on("end", () => {
                const parsedBody = new URLSearchParams(body);
                const prompt = parsedBody.get("prompt");

                // Call the updated askMistral function
                askMistral(prompt, (err, apiResponse) => {
                    if (err) {
                        res.writeHead(500, {
                            "Content-Type": "application/json",
                        });
                        res.end(
                            JSON.stringify({
                                error:
                                    "Error interacting with API: " +
                                    err.message,
                            })
                        );
                    } else {
                        res.writeHead(200, {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*", // Allow cross-origin requests
                        });
                        res.end(JSON.stringify({ response: apiResponse.text }));
                    }
                });
            });
        } else {
            // Handle 404 Not Found
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not Found" }));
        }
    })
    .listen(3000, () => {
        console.log("Server running at https://localhost:3000/");
    });
