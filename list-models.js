const https = require('https');
const fs = require('fs');

// Try to read API key from .env
let apiKey = '';
try {
    const envFile = fs.readFileSync('.env', 'utf8');
    const match = envFile.match(/GEMINI_API_KEY=([^\n]+)/);
    if (match) apiKey = match[1].trim();
} catch (e) {
    console.error("Could not read .env");
}

if (!apiKey) {
    console.error("GEMINI_API_KEY not found");
    process.exit(1);
}

https.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.models) {
                parsed.models.forEach(m => {
                    if (m.name.includes("gemini-1.5")) {
                        console.log(`- ${m.name} (Methods: ${m.supportedGenerationMethods.join(', ')})`);
                    }
                });
            } else {
                console.log("Response:", parsed);
            }
        } catch(e) { console.error(e) }
    });
}).on('error', err => console.error(err));
