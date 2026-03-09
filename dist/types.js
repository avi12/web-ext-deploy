export var StoreStatus;
(function (StoreStatus) {
    StoreStatus["Pending"] = "pending";
    StoreStatus["Running"] = "running";
    StoreStatus["Success"] = "success";
    StoreStatus["Error"] = "error";
})(StoreStatus || (StoreStatus = {}));
export var StoreName;
(function (StoreName) {
    StoreName["Chrome"] = "chrome";
    StoreName["Firefox"] = "firefox";
    StoreName["Edge"] = "edge";
    StoreName["Opera"] = "opera";
})(StoreName || (StoreName = {}));
export function defineStore(config) {
    return {
        name: config.name,
        schema: config.schema,
        deploy(options, context) {
            const result = config.schema.safeParse(options);
            if (!result.success) {
                throw result.error;
            }
            return config.deploy(result.data, context);
        },
        cookieFields: config.cookieFields,
        dynamicFields: config.dynamicFields,
        cliOverridableFields: config.cliOverridableFields
    };
}
