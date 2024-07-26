import path from 'path'
import { Configuration, DefinePlugin } from 'webpack'
import HtmlWebpackPlugin from 'html-webpack-plugin'

export default function (env) {
  return {
    mode: 'development',
    entry: './src/index.js',
    devtool: 'source-map',
    devServer: {
      port: 9000,
      client: {
        overlay: false,
      },
    },

    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-react', '@babel/preset-flow'],
            },
          },
        },
      ],
    },

    resolve: {
      // 由于各模块直接存在引用关系，所以要添加路径别名保证路径正确
      alias: {
        '@' /**                 */: path.resolve(__dirname, './src'),
        react /**               */: path.resolve(__dirname, `./packages/${env.version}/react`),
        'react-dom' /**         */: path.resolve(__dirname, `./packages/${env.version}/react-dom`),
        'react-reconciler' /**  */: path.resolve(__dirname, `./packages/${env.version}/react-reconciler`),
        scheduler /**           */: path.resolve(__dirname, `./packages/${env.version}/scheduler`),
        shared /**              */: path.resolve(__dirname, `./packages/${env.version}/shared`),
      },
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: './src/index.html',
      }),

      // 一些不重要的环境变量置为false
      new DefinePlugin({
        __DEV__: false,
        __PROFILE__: false,
        __EXPERIMENTAL__: false,
      }),
    ],
  } as Configuration
}
