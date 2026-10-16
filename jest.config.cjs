module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  setupFiles: ["<rootDir>/test/setup.cjs"],
  transform: { "^.+\\.ts$": ["@swc/jest"] },
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
};
