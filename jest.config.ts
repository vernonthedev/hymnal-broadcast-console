export default {
    preset: "ts-jest",
    testEnvironment: "jsdom",
    roots: ["<rootDir>"],
    testMatch: ["**/__tests__/**/*.ts"],
    moduleNameMapper: {
        "\\.(css|less|scss|sass)$": "identity-obj-proxy",
    },
    transform: {
        "^.+\\.tsx?$": ["ts-jest", { diagnostics: false }],
    },
};
