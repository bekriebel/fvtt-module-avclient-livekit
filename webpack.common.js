const CopyPlugin = require("copy-webpack-plugin");
const path = require('path');
const webpack = require('webpack');

module.exports = {
  target: "browserslist",
  entry: {
    "avclient-livekit": "./src/avclient-livekit.js"
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "module.json" },
        { from: "lang/", to: "lang/" },
        { from: "css/", to: "css/" },
      ],
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ],
  resolve: {
    fallback: {
      "buffer": require.resolve("buffer/"),
      "crypto": require.resolve("crypto-browserify/"),
      "stream": require.resolve("stream-browserify"),
      "util": require.resolve("util/")
    },
    symlinks: false
  }
};