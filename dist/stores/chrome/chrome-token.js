import { StoreName } from "../../types.js";
import { config } from "../../utils/dotenv.js";
import { createGitIgnoreIfNeeded, headersToEnv } from "../../utils/helpers.js";
import { Box, Newline, render, Text, useApp } from "ink";
import { exec } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import React, { useEffect, useState } from "react";
import { z } from "zod";
export const ChromeTokenOptionsSchema = z.object({
    clientId: z.string().nonempty().describe("OAuth client ID"),
    clientSecret: z.string().nonempty().describe("OAuth client secret"),
    printOnly: z.boolean().optional().describe("Print token to terminal instead of saving to chrome.env")
});
const TokenResponseSchema = z.object({
    access_token: z.string(),
    expires_in: z.number(),
    refresh_token: z.string().optional(),
    scope: z.string(),
    token_type: z.literal("Bearer")
});
const PORT = 8818;
const REDIRECT_URI = `http://localhost:${PORT}`;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
function getOpenCommand(url) {
    if (process.platform === "win32") {
        return `start "" "${url}"`;
    }
    if (process.platform === "darwin") {
        return `open "${url}"`;
    }
    // linux
    return `xdg-open "${url}"`;
}
function openBrowser(url) {
    exec(getOpenCommand(url));
}
async function exchangeCodeForToken(code, clientId, clientSecret) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: REDIRECT_URI,
            grant_type: "authorization_code"
        })
    });
    const result = TokenResponseSchema.safeParse(await response.json());
    if (!result.success) {
        return { error: result.error };
    }
    return result.data;
}
var Step;
(function (Step) {
    Step["Waiting"] = "waiting";
    Step["Exchanging"] = "exchanging";
    Step["Success"] = "success";
    Step["Error"] = "error";
})(Step || (Step = {}));
function getSymbol(step) {
    if (step === Step.Success) {
        return React.createElement(Text, { color: "green" }, "\u2714");
    }
    if (step === Step.Error) {
        return React.createElement(Text, { color: "red" }, "\u2716");
    }
    return React.createElement(Text, { color: "cyan" }, "\u25CF");
}
function getTokenStepLabel(step) {
    if (step === Step.Exchanging) {
        return "Exchanging code for token...";
    }
    if (step === Step.Success) {
        return "Token received";
    }
    return "Token exchange failed";
}
function StatusLine({ step, label }) {
    return React.createElement(Text, null,
        getSymbol(step),
        " ",
        label);
}
function App({ clientId, clientSecret, onSuccess, onError }) {
    const { exit } = useApp();
    const [step, setStep] = useState(Step.Waiting);
    const [errorMessage, setErrorMessage] = useState("");
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        access_type: "offline",
        scope: "https://www.googleapis.com/auth/chromewebstore",
        prompt: "consent"
    })}`;
    useEffect(() => {
        const server = createServer(async (request, response) => {
            const url = new URL(request.url ?? "/", REDIRECT_URI);
            const code = url.searchParams.get("code");
            const authError = url.searchParams.get("error");
            if (authError) {
                response.writeHead(HTTP_OK, { "Content-Type": "text/html" });
                response.end("<h1>Authorization failed</h1><p>Check the terminal for details</p>");
                const message = `Authorization failed: ${authError}`;
                onError(new Error(message));
                setErrorMessage(message);
                setStep(Step.Error);
                server.close();
                return;
            }
            if (!code) {
                response.writeHead(HTTP_BAD_REQUEST);
                response.end();
                return;
            }
            setStep(Step.Exchanging);
            const data = await exchangeCodeForToken(code, clientId, clientSecret);
            response.writeHead(HTTP_OK, { "Content-Type": "text/html" });
            if ("error" in data) {
                response.end("<h1>Failed to retrieve refresh token</h1><p>Check the terminal for details</p>");
                const message = `Token exchange failed: ${JSON.stringify(data.error, null, 2)}`;
                onError(new Error(message));
                setErrorMessage(message);
                setStep(Step.Error);
            }
            else if (data.refresh_token) {
                response.end("<h1>Success!</h1><p>You can close this tab</p>");
                onSuccess(data.refresh_token);
                setStep(Step.Success);
            }
            else {
                response.end("<h1>Failed to retrieve refresh token</h1><p>Check the terminal for details</p>");
                const message = `No refresh token in response - try revoking access at https://myaccount.google.com/permissions and retry`;
                onError(new Error(message));
                setErrorMessage(message);
                setStep(Step.Error);
            }
            server.close();
        });
        server.listen(PORT, () => {
            openBrowser(authUrl);
        });
        return () => {
            server.close();
        };
    }, []);
    useEffect(() => {
        if (step === Step.Success || step === Step.Error) {
            exit();
        }
    }, [step, exit]);
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Text, { bold: true, color: "cyan" }, "Chrome Web Store - Refresh Token"),
        React.createElement(Newline, null),
        React.createElement(StatusLine, { step: step === Step.Waiting ? Step.Waiting : Step.Success, label: step === Step.Waiting ? "Waiting for authorization in browser..." : "Authorization received" }),
        (step === Step.Exchanging || step === Step.Success || step === Step.Error) && (React.createElement(StatusLine, { step: step === Step.Exchanging ? Step.Waiting : step, label: getTokenStepLabel(step) })),
        React.createElement(Newline, null),
        step === Step.Waiting && (React.createElement(Text, { dimColor: true },
            "If the browser didn't open, visit:",
            "\n",
            authUrl)),
        step === Step.Error && (React.createElement(Text, { color: "red" }, errorMessage))));
}
export async function runChromeToken(clientId, clientSecret, printOnly) {
    const refreshToken = await getChromeRefreshToken(clientId, clientSecret);
    if (printOnly) {
        console.log(`\n${refreshToken}`);
        return;
    }
    const envFile = "chrome.env";
    const { parsed: envCurrent = {} } = config({ path: envFile });
    fs.writeFileSync(envFile, headersToEnv({ ...envCurrent, REFRESH_TOKEN: refreshToken }));
    createGitIgnoreIfNeeded([StoreName.Chrome]);
    console.log("\nSaved refresh token to chrome.env");
}
async function getChromeRefreshToken(clientId, clientSecret) {
    let tokenResult = "";
    let errorResult;
    const instance = render(React.createElement(App, { clientId: clientId, clientSecret: clientSecret, onSuccess: token => {
            tokenResult = token;
        }, onError: error => {
            errorResult = error;
        } }));
    await instance.waitUntilExit();
    if (errorResult) {
        throw errorResult;
    }
    return tokenResult;
}
