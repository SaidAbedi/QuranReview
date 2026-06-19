module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // worklets: false keeps the worklets babel transform disabled so Metro
      // doesn't crash with react-native-worklets 0.8.3's plugin bug.
      // The native worklets runtime (needed by Reanimated) is included in the
      // binary as long as react-native-worklets is installed — the babel flag
      // only controls the JS transform, not the native side.
      ['babel-preset-expo', { worklets: false }],
    ],
  };
};
