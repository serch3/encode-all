import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setupTests.ts'],
  moduleNameMapper: {
    // CSS modules & assets
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(png|jpg|jpeg|gif|svg|ico)$': '<rootDir>/src/test/__mocks__/fileMock.ts',
    '^framer-motion$': '<rootDir>/src/test/__mocks__/framerMotionMock.ts',
    '^@heroui/react$': '<rootDir>/src/test/__mocks__/herouiReactMock.ts',
    '^@renderer/(.*)$': '<rootDir>/src/renderer/src/$1',
    '^@test-utils$': '<rootDir>/src/test/utils.tsx'
  },
  modulePathIgnorePatterns: ['<rootDir>/src/test/__mocks__/herouiReactMock.tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }]
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(tsx?)$',
  collectCoverageFrom: [
    'src/renderer/src/**/*.{ts,tsx}',
    '!src/**/index.{ts,tsx}',
    '!src/main/**',
    '!src/preload/**',
    '!src/test/**'
  ],
  coverageDirectory: '<rootDir>/coverage',
  clearMocks: true,
  coverageThreshold: {
    global: {
      lines: 50,
      statements: 50,
      functions: 40,
      branches: 30
    }
  }
}

export default config
