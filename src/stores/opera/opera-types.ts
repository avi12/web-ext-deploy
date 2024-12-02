export interface ListVersions {
  id: number;
  slug: string;
  name: string;
  type: string;
  versions: Array<{
    version: string;
    submitted_for_moderation: boolean;
    type: string;
    created: string;
    warnings: Array<string>;
    retirejs_warnings: [];
  }>;
  published_versions: Array<{
    name: string;
    version: {
      version: string;
      submitted_for_moderation: boolean;
      type: string;
      created: string;
      warnings: Array<string>;
      retirejs_warning: [];
    };
  }>;
  developer: string;
  is_editable: boolean;
  app_id: string;
  category: {
    slug: string;
    name: string;
  };
  warnings: Array<string>;
  unlisted: boolean;
  details_url: string;
  is_published: boolean;
  available_auto_moderation: boolean;
  dev_promotional_image: {
    id: number;
    url: string;
  };
  is_extension: boolean;
  retirejs_warnings: [];
}

export type ListingDetail = {
  version: string;
  submitted_for_moderation: boolean;
  support: string | null;
  source_url: string | null;
  service_url: string | null;
  source_for_moderators_url: string | null;
  build_instructions: string;
  features: Array<{
    name: string;
  }>;
  file_size: number;
  icon: {
    id: number;
    width: number;
    height: number;
    url: string;
  };
  screenshots: Record<
    string,
    {
      id: number;
      url: string;
    }
  >;
  video: string | null;
  license: {
    url: string | null;
    full_text: string;
  };
  translations: Record<
    string,
    {
      language: {
        code: string;
        name: string;
      };
      short_description: string;
      long_description: string;
      changelog: string;
    }
  >;
  type: string;
  created: string;
  warnings: Array<string>;
  download_url: string;
  retirejs_warnings: [];
};

interface DidChanges {
  version: string;
  support: string;
  source_url: string;
  service_url: string;
  source_for_moderators_url: string;
  build_instructions: string;
  video: string;
  license: {
    url: string;
    full_text: string;
  };
  privacy_policy: {
    url: string;
    full_text: string;
  };
}

export type SubmitChanges = DidChanges;
export type CancelChanges = DidChanges;

interface UploadResultSuccess {
  version: string;
  submitted_for_moderation: boolean;
  type: string;
  created: string;
  warnings: Array<string>;
  retirejs_warnings: [];
}

interface UploadResultError {
  package_file: string;
}

export type UploadResult = UploadResultSuccess | UploadResultError;
