const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    service_worker: './src/service_worker.js',
    devtools: './src/devtools.js',
    panel: './src/panel.js',
    options: '/src/options.js',
    segmented: './src/segmented.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),  // Output directory for bundled files
    filename: '[name].js',                  // Output filename pattern, based on entry points (e.g., background.js, content.js)
  },
  mode: 'development',
  devtool: false,
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '.' },  // Copies manifest.json and other static files from 'public' folder to 'dist'
      ],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader', // Optional: Transpile modern JavaScript with Babel
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'], // Optional: Load CSS files
      },
    ],
  },
};
