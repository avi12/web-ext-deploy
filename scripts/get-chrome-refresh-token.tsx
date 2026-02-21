import { render, Box, Text, Newline, useApp } from "ink";
import { exec } from "node:child_process";
import { createServer, type Server } from "node:http";
import React, { useState, useEffect } from "react";
import { z } from "zod";

// https://developers.google.com/identity/protocols/oauth2/web-server#creatingclient
const AuthRequestSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  response_type: z.literal("code"),
  access_type: z.literal("offline"),
  scope: z.string(),
  prompt: z.literal("consent")
});

// https://developers.google.com/identity/protocols/oauth2/web-server#exchange-authorization-code
const TokenRequestSchema = z.object({
  code: z.string(),
  client_id: z.string(),
  client_secret: z.string(),
  redirect_uri: z.string(),
  grant_type: z.literal("authorization_code")
});

const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string(),
  token_type: z.literal("Bearer")
});

const SCOPE = "https://www.googleapis.com/auth/chromewebstore";
const PORT = 8818;
const REDIRECT_URI = `http://localhost:${PORT}`;

const [,, clientId, clientSecret] = process.argv[2];

if (!clientId || !clientSecret) {
  console.error("Usage: pnpm chrome:token <client-id> <client-secret>");
  process.exit(1);
}

function getOpenCommand(url: string) {
  if (process.platform === "win32") {
    return `start "" "${url}"`;
  }
  if (process.platform === "darwin") {
    return `open "${url}"`;
  }
  // linux
  return `xdg-open "${url}"`;
}

function openBrowser(url: string) {
  exec(getOpenCommand(url));
}

async function exchangeCodeForToken(code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(TokenRequestSchema.parse({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code"
    }))
  });
  const result = TokenResponseSchema.safeParse(await response.json());
  if (!result.success) {
    return { error: result.error };
  }
  return result.data;
}

const authParams = new URLSearchParams(AuthRequestSchema.parse({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  access_type: "offline",
  scope: SCOPE,
  prompt: "consent"
}));
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams}`;

type Step = "waiting" | "exchanging" | "success" | "error";

function getSymbol(step: Step) {
  if (step === "success") {
    return <Text color="green">✔</Text>;
  }
  if (step === "error") {
    return <Text color="red">✖</Text>;
  }
  return <Text color="cyan">●</Text>;
}

function getTokenStepLabel(step: Step) {
  if (step === "exchanging") {
    return "Exchanging code for token...";
  }
  if (step === "success") {
    return "Token received";
  }
  return "Token exchange failed";
}

function StatusLine({ step, label }: { step: Step; label: string }) {
  return <Text>{getSymbol(step)} {label}</Text>;
}

function App() {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>("waiting");
  const [refreshToken, setRefreshToken] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const server: Server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      const code = url.searchParams.get("code");
      const authError = url.searchParams.get("error");

      if (authError) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Authorization failed</h1><p>Check the terminal for details</p>");
        setErrorMessage(`Authorization failed: ${authError}`);
        setStep("error");
        server.close();
        return;
      }

      if (!code) {
        res.writeHead(400);
        res.end();
        return;
      }

      setStep("exchanging");
      const data = await exchangeCodeForToken(code);
      res.writeHead(200, { "Content-Type": "text/html" });

      if ("error" in data) {
        res.end("<h1>Failed to retrieve refresh token</h1><p>Check the terminal for details</p>");
        setErrorMessage(`Token exchange failed: ${JSON.stringify(data.error, null, 2)}`);
        setStep("error");
      } else if (data.refresh_token) {
        res.end("<h1>Success!</h1><p>You can close this tab</p>");
        setRefreshToken(data.refresh_token);
        setStep("success");
      } else {
        res.end("<h1>Failed to retrieve refresh token</h1><p>Check the terminal for details</p>");
        setErrorMessage("No refresh token in response — try revoking access at https://myaccount.google.com/permissions and retry");
        setStep("error");
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
    if (step === "success" || step === "error") {
      exit();
    }
  }, [step, exit]);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Chrome Web Store — Refresh Token</Text>
      <Newline />

      <StatusLine
        step={step === "waiting" ? "waiting" : "success"}
        label={step === "waiting" ? "Waiting for authorization in browser..." : "Authorization received"}
      />

      {(step === "exchanging" || step === "success" || step === "error") && (
        <StatusLine
          step={step === "exchanging" ? "waiting" : step}
          label={getTokenStepLabel(step)}
        />
      )}

      <Newline />

      {step === "waiting" && (
        <Text dimColor>If the browser didn't open, visit:{"\n"}{authUrl}</Text>
      )}

      {step === "success" && (
        <Box flexDirection="column">
          <Text color="green" bold>Refresh token:</Text>
          <Text>{refreshToken}</Text>
        </Box>
      )}

      {step === "error" && (
        <Text color="red">{errorMessage}</Text>
      )}
    </Box>
  );
}

render(<App />);
