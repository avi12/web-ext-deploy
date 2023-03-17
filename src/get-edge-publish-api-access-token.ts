import axios from "axios";
import dotenv from "dotenv";
import { createGitIgnoreIfNeeded, headersToEnv } from "./utils.js";
import fs from "fs";

type EdgePublishApi = {
  clientId: string;
  clientSecret: string;
  accessTokenUrl: string;
};

function getUrlSearchParams(credentials: object): string {
  return new URLSearchParams(Object.entries(credentials)).toString();
}

async function getData({ clientId, clientSecret, accessTokenUrl }: EdgePublishApi): Promise<{
  access_token?: string;
  expires_in?: number;
  error_description?: string;
}> {
  return axios
    .post(
      accessTokenUrl,
      getUrlSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.addons.microsoftedge.microsoft.com/.default",
        client_id: clientId,
        client_secret: clientSecret
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    )
    .then(res => res.data)
    .catch(
      e =>
        e.response.data || {
          error_description: "The client ID, client secret and/or the access token URL are in an invalid format"
        }
    );
}

export function appendToEdgeEnv(data: object): void {
  const filename = "./edge.env";
  const { parsed: envCurrent = {} } = dotenv.config({ path: filename });
  const envAccessToken = dotenv.parse(headersToEnv(data));
  const envNew = { ...envCurrent, ...envAccessToken };
  fs.writeFileSync(filename, headersToEnv(envNew));
}

export async function getEdgePublishApiAccessToken({
  clientId,
  clientSecret,
  accessTokenUrl
}: EdgePublishApi): Promise<{ accessToken: string }> {
  return new Promise(async (resolve, reject) => {
    const { access_token, expires_in, error_description } = await getData({
      clientId,
      clientSecret,
      accessTokenUrl
    });

    if (expires_in <= 20) {
      reject(
        "Error Edge: The client ID, client secret and/or access token URL have expired. Retrieve the new ones: https://partner.microsoft.com/en-us/dashboard/microsoftedge/publishapi"
      );
      return;
    }

    if (error_description) {
      reject(`Error Edge: ${error_description}`);
      return;
    }

    appendToEdgeEnv({
      ACCESS_TOKEN: access_token,
      CLIENT_ID: clientId,
      CLIENT_SECRET: clientSecret,
      ACCESS_TOKEN_URL: accessTokenUrl
    });

    createGitIgnoreIfNeeded(["edge"]);

    console.log(
      "Info Edge: Saved the Edge Publish API's client ID, client secret, access token, and access token URL to edge.env"
    );
    resolve({ accessToken: access_token });
  });
}
