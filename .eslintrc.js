module.exports = {
  extends: [
    'alloy',
    'alloy/vue',
  ],
  plugins: ['@typescript-eslint'],
  env: {
    // 你的环境变量
  },
  globals: {},
  rules: {
    // 自定义你的规则
    'vue/component-tags-order': ['off'],
    'vue/no-multiple-template-root': ['off'],
    // Vue 3 permits static and dynamic class/style together and keys the
    // <template v-for> itself. The editor passes mutable store objects to
    // settings panels, while replacing a prop itself is still disallowed.
    'vue/no-duplicate-attributes': ['error', { allowCoexistClass: true, allowCoexistStyle: true }],
    'vue/no-v-for-template-key': 'off',
    'vue/no-v-for-template-key-on-child': 'error',
    'vue/valid-template-root': 'off',
    'vue/no-mutating-props': ['error', { shallowOnly: true }],
    // Explicitly discarded promises are used for background tasks.
    'no-void': ['error', { allowAsStatement: true }],
    // This rule was removed after script setup became standard in Vue 3.
    'vue/experimental-script-setup-vars': 'off',
    // Style-only limits; the editor has large canvas/PSD routines where splitting them adds risk.
    'max-params': 'off',
    complexity: 'off',
    // 'no-undef': 'off', // 禁止使用未定义的变量，会把TS声明视为变量，暂时关闭
  },
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaFeatures: {
      legacyDecorators: true, // 配置允许注解
    },
  },
  overrides: [{
    files: ['*.ts', '*.vue'],
    rules: {
      // TypeScript resolves identifiers and understands type-only bindings.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-use-before-define': 'off',
      // Vue setup frequently captures later declarations in deferred callbacks;
      // typecheck catches immediate use before initialization.
      '@typescript-eslint/no-use-before-define': ['error', { functions: false, variables: false, ignoreTypeReferences: true }],
    },
  }],
}
