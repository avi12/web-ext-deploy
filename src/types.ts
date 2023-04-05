export const Stores = ["chrome", "firefox", "edge", "opera"] as const;
export type SupportedStores = typeof Stores[number];
export type SupportedGetCookies = "firefox" | "opera";

interface FirefoxErrorMessage {
  message: string;
  description: string;
  instancePath: string;
  type: "error" | "warning";
  id: string[];
  tier: number;
}

export interface FirefoxCreateNewVersion {
  id: number;
  approval_notes: string;
  channel: "listed" | "unlisted";
  compatibility: {
    firefox?: { min: string; max: string };
  };
  edit_url: string;
  file: {
    id: number;
    created: string;
    hash: string;
    is_mozilla_signed_extension: boolean;
    size: number;
    status: string;
    url: string;
    permissions: string[];
    optional_permissions: string[];
    host_permissions: string[];
  };
  is_disabled: boolean;
  is_strict_compatibility_enabled: boolean;
  license: {
    id: number;
    is_custom: boolean;
    name: { [langCode: string]: string };
    slug: string;
    text: { [langCode: string]: string };
    url: string;
  };
  release_notes: { [langCode: string]: string };
  reviewed: string | null;
  source: string | null;
  version: string;
}

export type FirefoxUploadSource = FirefoxCreateNewVersion;

export interface FirefoxUploadDetail {
  uuid: string;
  channel: "listed" | "unlisted";
  processed: boolean;
  submitted: boolean;
  url: string;
  valid: boolean;
  validation: { messages?: FirefoxErrorMessage[] };
  version: string;
}
