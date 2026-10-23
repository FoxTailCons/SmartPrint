module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2021,
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['react'],
  extends: ['eslint:recommended', 'plugin:react/recommended'],
  rules: {
    'react/react-in-prop-types': 'off',
    'react/prop-types': 'off',
  }
}