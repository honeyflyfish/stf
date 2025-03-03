var gulp = require('gulp')
var gutil = require('gulp-util')
var jshint = require('gulp-jshint')
var jsonlint = require('gulp-jsonlint')
var webpack = require('webpack')
var ngAnnotatePlugin = require('ng-annotate-webpack-plugin')
var webpackConfig = require('./webpack.config').webpack
var webpackStatusConfig = require('./res/common/status/webpack.config')
var gettext = require('gulp-angular-gettext')
var jade = require('gulp-jade')
var del = require('del')
var runSequence = require('run-sequence').use(gulp)
//var protractor = require('gulp-protractor')
var protractor = require('./res/test/e2e/helpers/gulp-protractor-adv')
var protractorConfig = './res/test/protractor.conf'
var karma = require('karma').server
var karmaConfig = '/res/test/karma.conf.js'
var stream = require('stream')
var jscs = require('gulp-jscs')
var run = require('gulp-run')

gulp.task('jshint', function () {
  return gulp.src([
    'lib/**/*.js', 'res/app/**/*.js', 'res/auth-ldap/**/*.js',
    'res/auth-mock/**/*.js', 'res/common/**/*.js', 'res/test/**/*.js',
    '*.js'
  ])
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'))
})

gulp.task('jsonlint', function () {
  return gulp.src([
    '.jshintrc', 'res/.jshintrc', '.bowerrc', '.yo-rc.json', '*.json'
  ])
    .pipe(jsonlint())
    .pipe(jsonlint.reporter())
})

gulp.task('jscs', function () {
  return gulp.src([
    'lib/**/*.js', 'res/app/**/*.js', 'res/auth-ldap/**/*.js',
    'res/auth-mock/**/*.js', 'res/common/**/*.js', 'res/test/**/*.js',
    '*.js'
  ])
    .pipe(jscs())
});

gulp.task('lint', ['jshint', 'jsonlint'])
gulp.task('test', ['lint'])

gulp.task('build', function (cb) {
  runSequence('clean', 'webpack:build', cb)
})

gulp.task('karma_ci', function (done) {
  karma.start({
    configFile: __dirname + karmaConfig,
    singleRun: true
  }, done)
})

gulp.task('karma', function (done) {
  karma.start({
    configFile: __dirname + karmaConfig
  }, done)
})

if (gutil.env.multi) {
  protractorConfig = './res/test/protractor-multi.conf'
} else if (gutil.env.appium) {
  protractorConfig = './res/test/protractor-appium.conf'
}

gulp.task('webdriver-update', protractor.webdriver_update)
gulp.task('webdriver-standalone', protractor.webdriver_standalone)
gulp.task('protractor-explorer', function (callback) {
  protractor.protractor_explorer({
    url: require(protractorConfig).config.baseUrl
  }, callback)
})

gulp.task('protractor', ['webdriver-update'], function (callback) {
  gulp.src(["./res/test/e2e/**/*.js"])
    .pipe(protractor.protractor({
      configFile: protractorConfig,
      debug: gutil.env.debug,
      suite: gutil.env.suite
    }))
    .on('error', function (e) {
      console.log(e)
    }).on('end', callback)
})

// For piping strings
function fromString(filename, string) {
  var src = stream.Readable({objectMode: true})
  src._read = function () {
    this.push(new gutil.File({
      cwd: '', base: '', path: filename, contents: new Buffer(string)
    }))
    this.push(null)
  }
  return src
}


// For production
gulp.task("webpack:build", function (callback) {
  var myConfig = Object.create(webpackConfig)
  myConfig.plugins = myConfig.plugins.concat(
    new webpack.DefinePlugin({
      "process.env": {
        "NODE_ENV": JSON.stringify('production')
      }
    })
    //new webpack.optimize.DedupePlugin(),
    //new ngAnnotatePlugin({
    //  add: true,
    //})
    // TODO: mangle when ngmin works
    //new webpack.optimize.UglifyJsPlugin({mangle: false})
  )
  myConfig.devtool = false

  webpack(myConfig, function (err, stats) {
    if (err) {
      throw new gutil.PluginError('webpack:build', err)
    }

    gutil.log("[webpack:build]", stats.toString({
      colors: true
    }))

    // Save stats to a json file
    // Can be analyzed in http://webpack.github.io/analyse/
    fromString('stats.json', JSON.stringify(stats.toJson()))
      .pipe(gulp.dest('./tmp/'))

    callback()
  })
})

gulp.task("webpack:others", function (callback) {
  var myConfig = Object.create(webpackStatusConfig)
  myConfig.plugins = myConfig.plugins.concat(
    new webpack.DefinePlugin({
      "process.env": {
        "NODE_ENV": JSON.stringify('production')
      }
    }),
    new webpack.optimize.DedupePlugin()
//    new ngminPlugin(),
//    new webpack.optimize.UglifyJsPlugin({mangle: false})
  )
  myConfig.devtool = false

  webpack(myConfig, function (err, stats) {
    if (err) {
      throw new gutil.PluginError('webpack:others', err)
    }

    gutil.log("[webpack:others]", stats.toString({
      colors: true
    }))
    callback()
  })
})

gulp.task('translate', ['translate:compile'])

gulp.task('jade', function (cb) {
  return gulp.src([
    './res/**/*.jade', '!./res/bower_components/**'
  ])
    .pipe(jade({
      locals: {
        // So res/views/docs.jade doesn't complain
        markdownFile: {
          parseContent: function () {
          }
        }
      }
    }))
    .pipe(gulp.dest('./tmp/html/'))
})

gulp.task('translate:extract', ['jade'], function (cb) {
  return gulp.src([
    './tmp/html/**/*.html', './res/**/*.js', '!./res/bower_components/**',
    '!./res/build/**'
  ])
    .pipe(gettext.extract('stf.pot'))
    .pipe(gulp.dest('./res/common/lang/po/'))
})

gulp.task('translate:compile', ['translate:pull'], function (cb) {
  return gulp.src('./res/common/lang/po/**/*.po')
    .pipe(gettext.compile({
      format: 'json'
    }))
    .pipe(gulp.dest('./res/common/lang/translations/'))
})

gulp.task('translate:push', ['translate:extract'], function () {
  gutil.log('Pushing translation source to Transifex...')

  return run('tx push -s').exec()
})

gulp.task('translate:pull', ['translate:push'], function () {
  gutil.log('Pulling translations from Transifex...')

  return run('tx pull').exec()
})




gulp.task('clean', function (cb) {
  del(['./tmp', './res/build'], cb)
})
