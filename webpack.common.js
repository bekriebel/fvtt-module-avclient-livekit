/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
const CopyPlugin = require("copy-webpack-plugin");
const path = require("path");
const webpack = require("webpack");

module.exports = {
  target: "browserslist",
  entry: {
    "avclient-livekit": "./src/avclient-livekit.ts",
    "livekit-web-client": "./src/livekit-web-client.ts",
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "css/", to: "css/" },
        { from: "lang/", to: "lang/" },
        { from: "templates/", to: "templates/" },
        { from: "web-client/", to: "web-client/" },
        { from: "*.md" },
        { from: "module.json" },
        { from: "LICENSE*" },
      ],
    }),
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
      process: "process/browser",
    }),
  ],
  resolve: {
    extensions: ["", ".webpack.js", ".web.js", ".ts", ".tsx", ".js"],
    fallback: {
      buffer: require.resolve("buffer/"),
      crypto: require.resolve("crypto-browserify/"),
      stream: require.resolve("stream-browserify"),
      util: require.resolve("util/"),
    },
    symlinks: false,
  },
  module: {
    rules: [
      // All files with a ".ts" or ".tsx" extension will be handled by "ts-loader".
      { test: /\.tsx?$/, loader: "ts-loader", exclude: /node_modules/ },
      // All output ".js" files will have any sourcemaps re-processed by "source-map-loader".
      { test: /\.js$/, loader: "source-map-loader", exclude: /node_modules/ },
      // Fix build bug with webpack 5: https://github.com/remirror/remirror/issues/1473
      {
        test: /\.m?js/,
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },
};
