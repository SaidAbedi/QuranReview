module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // worklets: false disables the react-native-worklets/plugin which crashes
      // Metro with 'Cannot read properties of undefined (reading body)' on
      // react-native-worklets 0.8.3. We don't use Reanimated worklets, so this
      // is safe to disable.
      ['babel-preset-expo', { worklets: false }],
    ],
  };
};
