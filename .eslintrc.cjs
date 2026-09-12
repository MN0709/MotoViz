/** @type {import('eslint').Linter.Config} */
module.exports = {
  // 作为仓库根配置，阻止 ESLint 向父目录继续查找规则。
  root: true,
  // 浏览器与 Node.js 都使用 ES2020 全局语法。
  env: { browser: true, es2020: true, node: true },
  // 使用 TypeScript 解析器，统一检查 .ts 与 .tsx。
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2020, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  // 推荐规则负责代码质量，Prettier 配置负责关闭冲突的格式规则。
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:react-hooks/recommended', 'prettier'],
  ignorePatterns: ['dist', 'node_modules', 'coverage'],
  rules: {
    // 禁止显式 any，保证跨组 API 类型完整。
    '@typescript-eslint/no-explicit-any': 'error',
    // 类型声明允许暂未使用的字段；普通变量仍需清理。
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
  }
};
