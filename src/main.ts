import { gStores } from "./cli";
import { resolve } from "path";
import deployToFirefox from "./stores/firefox";

interface IJsonStore {
  chrome?: {
    extId: string;
    refreshToken: string;
    clientId: string;
    clientSecret: string;
    zip: string;
  };

  firefox?: {
    extId: string;
    email: string;
    password: string;
    twoFactor: number;
    zip: string;
    zipSource?: string;
    changelog: string;
    devChangelog: string;
  };

  edge?: {
    extId: string;
    email: string;
    password: string;
    zip: string;
    devChangelog?: string;
  };

  opera?: {
    extId: string;
    email: string;
    password: string;
    twoFactor: number;
    zip: string;
  };

  packageJson?: string;
}

function getJsonFor(storeName: string, pStores: IJsonStore): IJsonStore {
  const stores = { ...pStores };
  gStores.forEach(storeCurrent => {
    if (storeCurrent !== storeName) {
      delete stores[storeCurrent];
    }
  });
  return stores;
}

export default async function init(stores) {
  const prepareToDeployFuncs = {
    chrome: prepareToDeployChrome,
    firefox: prepareToDeployFirefox,
    edge: prepareToDeployEdge,
    opera: prepareToDeployOpera
  };

  const promises = gStores.map(storeName => {
    const jsonStore = getJsonFor(storeName, stores);
    return prepareToDeployFuncs[storeName](jsonStore);
  });
  await Promise.all(promises);
  process.exit(1);
}

export async function prepareToDeployFirefox(jsonStore: IJsonStore) {
  const {
    firefox: {
      email = "",
      password = "",
      twoFactor,
      extId,
      changelog = "",
      devChangelog = ""
    }
  } = jsonStore;
  let {
    firefox: { zip = "", zipSource = "" },
    packageJson = "package.json"
  } = jsonStore;

  packageJson = resolve(process.cwd(), packageJson);

  const { version } = await import(packageJson);
  if (zip.includes("{version}")) {
    zip = zip.replace("{version}", version);
  }

  if (zipSource.includes("{version}")) {
    zipSource = zipSource.replace("{version}", version);
  }

  zip = resolve(process.cwd(), zip);

  if (zipSource) {
    zipSource = resolve(process.cwd(), zipSource);
  }

  try {
    await deployToFirefox({
      email,
      password,
      twoFactor,
      extId,
      zip,
      zipSource,
      changelog,
      devChangelog
    });
    console.log(
      `Successfully uploaded "${extId}" version ${version} to the Firefox store.`
    );
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

// export async function prepareToDeployChrome(jsonStore) {}

// export async function prepareToDeployEdge(jsonStore) {}

// export async function prepareToDeployOpera(jsonStore) {}
