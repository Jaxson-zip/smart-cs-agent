module.exports = {
  transform: {
    '^.+\\.(t|j)s$': '@swc/jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@smart-cs-agent/shared$': '<rootDir>/../../packages/shared/src/index.ts'
  }
};