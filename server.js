const express = require("express");
const { chromium } = require("playwright");
const cron = require("node-cron");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

// 👉 Paste your Render URL here (or set env variable)
const SELF_URL = "https://itinerary-playwright.onrender.com"

app.use(express.json({ limit: "100mb" }));
app.use(express.text({ type: "text/html", limit: "100mb" }));

let browser = null;

// ------------------------------
// INIT BROWSER
// ------------------------------
async function initBrowser() {
    if (!browser) {
        console.log("Launching Playwright Chromium...");
        browser = await chromium.launch({
            headless: true
        });
    }
    return browser;
}

// ------------------------------
// CREATE PDF FROM HTML
// ------------------------------
async function createPDF(html) {
    let page;
    try {
        await initBrowser();

        page = await browser.newPage();

        await page.setContent(html, { waitUntil: "networkidle" });

        await page.evaluate(() => {
            document.querySelectorAll("img").forEach((img) => {
                img.style.maxWidth = "800px";
            });
        });

        const pdf = await page.pdf({
            format: "A4",
            printBackground: true
        });

        return pdf;

    } catch (err) {
        console.error("PDF generation failed:", err);
        throw err;
    } finally {
        if (page) await page.close();
    }
}

// ------------------------------
// API ENDPOINT
// ------------------------------
app.post("/generate-pdf", async (req, res) => {
    try {
        const html = typeof req.body === "string" ? req.body : req.body.html;
        if (!html) return res.status(400).json({ error: "HTML content required" });

        const pdf = await createPDF(html);
        const filename = req.body.filename || "document.pdf";

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${filename}"`,
            "Cache-Control": "no-store"
        });

        res.end(pdf);

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Failed to generate PDF" });
    }
});

// ------------------------------
// HEALTHCHECK
// ------------------------------
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ------------------------------
// KEEP-ALIVE SELF-PING (Render)
// ------------------------------
if (SELF_URL && SELF_URL.startsWith("http")) {
    console.log("Self-ping enabled. URL:", SELF_URL);

    cron.schedule("*/10 * * * *", () => {
        const url = `${SELF_URL}/health`;

        console.log("Pinging:", url);

        https.get(url, (res) => {
            console.log("Ping status:", res.statusCode);
        }).on("error", (err) => {
            console.error("Ping error:", err.message);
        });
    });
}

// ------------------------------
// START SERVER
// ------------------------------
app.listen(PORT, () => {
    console.log(`PDF service running on port ${PORT}`);
    initBrowser(); // warm start
});

// Graceful shutdown
process.on("SIGTERM", async () => {
    if (browser) await browser.close();
    process.exit(0);
});
