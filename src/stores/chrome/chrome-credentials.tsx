import { exec } from "node:child_process";
import { createServer, type Server } from "node:http";

import { Box, Newline, render, Text, useApp } from "ink";
import React, { useEffect, useState } from "react";
import { z } from "zod";

// https://developers.google.com/identity/protocols/oauth2/web-server#creatingclient
interface AuthRequest {
  client_id: string;
  redirect_uri: string;
  response_type: "code";
  access_type: "offline";
  scope: string;
  prompt: "consent";
  state: string;
}

// https://developers.google.com/identity/protocols/oauth2/web-server#exchange-authorization-code
interface TokenRequest {
  code: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  grant_type: "authorization_code";
}

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

async function exchangeCodeForToken({
  code,
  clientId,
  clientSecret
}: {
  code: string;
  clientId: string;
  clientSecret: string;
}) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code"
    } satisfies TokenRequest)
  });
  const result = TokenResponseSchema.safeParse(await response.json());
  if (!result.success) {
    return { error: result.error };
  }

  return result.data;
}

enum Step {
  WAITING = "waiting",
  EXCHANGING = "exchanging",
  SUCCESS = "success",
  ERROR = "error"
}

function getSymbol(step: Step) {
  if (step === Step.SUCCESS) {
    return <Text color="green">✔</Text>;
  }

  if (step === Step.ERROR) {
    return <Text color="red">✖</Text>;
  }

  return <Text color="cyan">●</Text>;
}

function getTokenStepLabel(step: Step) {
  if (step === Step.EXCHANGING) {
    return "Exchanging code for token...";
  }

  if (step === Step.SUCCESS) {
    return "Token received";
  }

  return "Token exchange failed";
}

function StatusLine({ step, label }: { step: Step; label: string }) {
  return (
    <Text>
      {getSymbol(step)} {label}
    </Text>
  );
}

interface AppProps {
  clientId: string;
  clientSecret: string;
  onSuccess: (refreshToken: string) => void;
  onError: (error: Error) => void;
}

function App({ clientId, clientSecret, onSuccess, onError }: AppProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>(Step.WAITING);
  const [errorMessage, setErrorMessage] = useState("");
  const [state] = useState(() => crypto.randomUUID());
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    scope: "https://www.googleapis.com/auth/chromewebstore",
    prompt: "consent",
    state
  } satisfies AuthRequest)}`;

  useEffect(() => {
    const server: Server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", REDIRECT_URI);
      const callbackState = url.searchParams.get("state");
      if (callbackState !== state) {
        response.writeHead(HTTP_BAD_REQUEST);
        response.end();
        return;
      }

      const code = url.searchParams.get("code");
      const authError = url.searchParams.get("error");
      if (authError) {
        response.writeHead(HTTP_OK, { "Content-Type": "text/html" });
        response.end("<h1>Authorization failed</h1><p>Check the terminal for details</p>");
        const message = `Authorization failed: ${authError}`;
        onError(new Error(message));
        setErrorMessage(message);
        setStep(Step.ERROR);
        server.close();
        return;
      }

      if (!code) {
        response.writeHead(HTTP_BAD_REQUEST);
        response.end();
        return;
      }

      setStep(Step.EXCHANGING);
      const data = await exchangeCodeForToken({
        code,
        clientId,
        clientSecret
      });
      response.writeHead(HTTP_OK, { "Content-Type": "text/html" });

      if ("error" in data) {
        response.end("<h1>Failed to retrieve refresh token</h1><p>Check the terminal for details</p>");
        const message = `Token exchange failed: ${JSON.stringify(data.error, null, 2)}`;
        onError(new Error(message));
        setErrorMessage(message);
        setStep(Step.ERROR);
      } else if (data.refresh_token) {
        response.end("<h1>Success!</h1><p>You can close this tab</p>");
        onSuccess(data.refresh_token);
        setStep(Step.SUCCESS);
      } else {
        response.end("<h1>Failed to retrieve refresh token</h1><p>Check the terminal for details</p>");
        const message = `No refresh token in response - try revoking access at https://myaccount.google.com/permissions and retry`;
        onError(new Error(message));
        setErrorMessage(message);
        setStep(Step.ERROR);
      }

      server.close();
    });

    server.listen(PORT, "127.0.0.1", () => {
      openBrowser(authUrl);
    });

    return () => {
      server.close();
    };
  }, []);

  useEffect(() => {
    const isTerminalStep = step === Step.SUCCESS || step === Step.ERROR;
    if (isTerminalStep) {
      exit();
    }
  }, [step, exit]);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Chrome Web Store - Refresh Token
      </Text>
      <Newline />

      <StatusLine
        step={step === Step.WAITING ? Step.WAITING : Step.SUCCESS}
        label={step === Step.WAITING ? "Waiting for authorization in browser..." : "Authorization received"}
      />

      {(step === Step.EXCHANGING || step === Step.SUCCESS || step === Step.ERROR) && (
        <StatusLine step={step === Step.EXCHANGING ? Step.WAITING : step} label={getTokenStepLabel(step)} />
      )}

      <Newline />

      {step === Step.WAITING && (
        <Text dimColor>
          If the browser didn't open, visit:{"\n"}
          {authUrl}
        </Text>
      )}

      {step === Step.ERROR && <Text color="red">{errorMessage}</Text>}
    </Box>
  );
}

export async function getChromeRefreshToken({
  clientId,
  clientSecret
}: {
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  let tokenResult = "";
  let errorResult: Error | undefined;

  const instance = render(
    <App
      clientId={clientId}
      clientSecret={clientSecret}
      onSuccess={token => {
        tokenResult = token;
      }}
      onError={error => {
        errorResult = error;
      }}
    />
  );

  await instance.waitUntilExit();

  if (errorResult) {
    throw errorResult;
  }

  return tokenResult;
}
