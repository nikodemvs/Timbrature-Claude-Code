// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];

// Fix zustand import.meta issue
config.resolver.unstable_conditionNames = ['require', 'react-native', 'browser'];

// Support .wasm files (expo-sqlite web)
config.resolver.assetExts.push('wasm');

config.maxWorkers = 2;

module.exports = config;
