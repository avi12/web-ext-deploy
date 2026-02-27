import { config } from "../../utils/dotenv.js";
import { createGitIgnoreIfNeeded, headersToEnv } from "../../utils/helpers.js";
import {
  Box,
  Newline,
  render,
  Text,
  useApp
} from "ink";
import { exec } from "node:child_process";
import fs from "node:fs";
import { createServer, type Server } from "node:http";
import React, { useEffect, useState } from "react";
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
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

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

async function exchangeCodeForToken(code: string, clientId: string, clientSecret: string) {
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

function buildAuthUrl(clientId: string) {
  const authParams = new URLSearchParams(AuthRequestSchema.parse({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    scope: SCOPE,
    prompt: "consent"
  }));
  return `https://accounts.google.com/o/oauth2/v2/auth?${authParams}`;
}

enum Step {
  Waiting = "waiting",
  Exchanging = "exchanging",
  Success = "success",
  Error = "error"
}

function getSymbol(step: Step) {
  if (step === Step.Success) {
    return <Text color="green">✔</Text>;
  }
  if (step === Step.Error) {
    return <Text color="red">✖</Text>;
  }
  return <Text color="cyan">●</Text>;
}

function getTokenStepLabel(step: Step) {
  if (step === Step.Exchanging) {
    return "Exchanging code for token...";
  }
  if (step === Step.Success) {
    return "Token received";
  }
  return "Token exchange failed";
}

function StatusLine({ step, label }: { step: Step; label: string }) {
  return <Text>{getSymbol(step)} {label}</Text>;
}

interface AppProps {
  clientId: string;
  clientSecret: string;
  onSuccess: (refreshToken: string) => void;
  onError: (error: Error) => void;
}

function App({
  clientId,
  clientSecret,
  onSuccess,
  onError
}: AppProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>(Step.Waiting);
  const [errorMessage, setErrorMessage] = useState("");
  const authUrl = buildAuthUrl(clientId);

  useEffect(() => {
    const server: Server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      const code = url.searchParams.get("code");
      const authError = url.searchParams.get("error");

      if (authError) {
        res.writeHead(HTTP_OK, { "Content-Type": "text/html" });
        res.end("<h1>Authorization failed</h1><p>Check the terminal for details</p>");
        const message = `Authorization failed: ${authError}`;
        onError(new Error(message));
        setErrorMessage(message);
        setStep(Step.Error);
        server.close();
        return;
      }

      if (!code) {
        res.writeHead(HTTP_BAD_REQUEST);
        res.end();
        return;
      }

      setStep(Step.Exchanging);
      const data = await exchangeCodeForToken(code, clientId, clientSecret);
      res.writeHead(HTTP_OK, { "Content-Type": "text/html" });

      if ("error" in data) {
        res.end("<h1>Failed to retrieve refresh token</h1><p>Check the terminal for details</p>");
        const message = `Token exchange failed: ${JSON.stringify(data.error, null, 2)}`;
        onError(new Error(message));
        setErrorMessage(message);
        setStep(Step.Error);
      } else if (data.refresh_token) {
        res.end("<h1>Success!</h1><p>You can close this tab</p>");
        onSuccess(data.refresh_token);
        setStep(Step.Success);
      } else {
        res.end("<h1>Failed to retrieve refresh token</h1><p>Check the terminal for details</p>");
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

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Chrome Web Store - Refresh Token</Text>
      <Newline />

      <StatusLine
        step={step === Step.Waiting ? Step.Waiting : Step.Success}
        label={step === Step.Waiting ? "Waiting for authorization in browser..." : "Authorization received"}
      />

      {(step === Step.Exchanging || step === Step.Success || step === Step.Error) && (
        <StatusLine
          step={step === Step.Exchanging ? Step.Waiting : step}
          label={getTokenStepLabel(step)}
        />
      )}

      <Newline />

      {step === Step.Waiting && (
        <Text dimColor>If the browser didn't open, visit:{"\n"}{authUrl}</Text>
      )}

      {step === Step.Error && (
        <Text color="red">{errorMessage}</Text>
      )}
    </Box>
  );
}

export async function runChromeToken(clientId: string, clientSecret: string, printOnly?: boolean) {
  const refreshToken = await getChromeRefreshToken(clientId, clientSecret);
  if (printOnly) {
    console.log(`\n${refreshToken}`);
    return;
  }
  const { parsed: envCurrent = {} } = config({ path: "chrome.env" });
  fs.writeFileSync("chrome.env", headersToEnv({ ...envCurrent, REFRESH_TOKEN: refreshToken }));
  createGitIgnoreIfNeeded(["chrome"]);
  console.log("\nSaved refresh token to chrome.env");
}

async function getChromeRefreshToken(clientId: string, clientSecret: string): Promise<string> {
  let tokenResult = "";
  let errorResult: Error | undefined;

  const instance = render(
    <App
      clientId={clientId}
      clientSecret={clientSecret}
      onSuccess={token => {
        tokenResult = token;
      }}
      onError={err => {
        errorResult = err;
      }}
    />
  );

  await instance.waitUntilExit();

  if (errorResult) {
    throw errorResult;
  }
  return tokenResult;
}
