var _ = require('lodash'),
  fs = require('fs'),
  util = require('util'),
  mkdirp = require('mkdirp'),
  consolidate = require('consolidate'),
  utils = require('./utils'),
  findit = require('findit');

function _getOutputFile(file, inPath, outPath) {
  var out = file.replace(inPath, outPath).replace(/\/{2,}/g, '/');
  if (!(/index\.html$/).test(out)) {
    out = out.replace(/\.html$/, '/index.html');
  }
  return out;
}

function _getOutputPath(file, inPath, outPath) {
  return _getOutputFile(file, inPath, outPath).replace(/\/[^\/]*$/, '');
}


function _build(file, inPath, outPath, encoding, engine, stat, cb) {
  var dataFile = file.replace(/html$/, 'json'),
    dirname = _getOutputPath(file, inPath, outPath),
    outFile = _getOutputFile(file, inPath, outPath);

  fs.readFile(dataFile, encoding, function (err, jsonData) {
    var data = stat;

    if (err) {
      utils.warn('No data for file', file);
    } else {
      try {
        data = _.extend(data, JSON.parse(jsonData));
      } catch (e) {
        utils.warn('Data not proper JSON', dataFile);
      }
    }

    consolidate[engine](file, data, function (err, html) {
      if (err || html.render) {
        utils.error('Unable to render file', file);
        process.exit(1);
      }

      mkdirp(dirname, function (err) {
        if (err && err.errno !== 47) {
          utils.error('Cannot make directory', dirname);
          process.exit(1);
        }

        fs.writeFile(outFile, html, encoding, function (err) {
          if (err) {
            utils.error('Cannot write file', outFile);
            return;
          }

          utils.out('[Built]', outFile);
          if (cb) {
            cb();
          }
        });
      });
    });
  });
}

function _copy(file, inPath, outPath, cb) {
  var out = file.replace(inPath, outPath),
    dirname = _getOutputPath(file);

  mkdirp(dirname, function (err) {
    if (err) {
      utils.error('Cannot make directory', dirname);
      process.exit(1);
    }

    var is = fs.createReadStream(file),
      os = fs.createWriteStream(out);
    util.pump(is, os, function (err) {
      if (err) {
        utils.warning('Failed to copy file', file);
      } else {
        utils.out('[Copied]', out);
      }
      cb(err);
    });
  });
}

exports.build = function (argv, cb) {
  var built = 0,
    files = 0,
    _path = argv._[0].replace(/\/$/, ''),
    _engine = argv.e,
    _ignore = ((!_.isArray(argv.i)) ? [argv.i] : argv.i) || [],
    _out = (argv.o[0] === '/') ? argv.o : process.cwd() + '/' + argv.o,
    _in = new RegExp('^' + _path),
    _encoding = argv.encoding,
    finder,
    __swig;

  cb = cb || function () {};

  _ignore = _.map(_ignore, function (ignore) {
    if ((/^\//).test(ignore) && (/\/$/).test(ignore)) {
      return new RegExp(ignore
        .replace(/^\//, '')
        .replace(/\/$/, ''));
    }
    return ignore;
  });

  if (!consolidate[_engine]) {
    utils.error('Template engine', argv.e, 'does not exist');
    process.exit(1);
  }

  if (_engine === 'swig') {
    // Swig requires some extra setup
    __swig = require('swig');
    __swig.init({
      root: _path,
      allowErrors: false
    });
  }

  utils.setLevel(argv.verbose);

  finder = findit.find(_path);

  finder.on('file', function (file, stat) {
    var isHTML = (/\.html$/).test(file),
      path,
      i = _ignore.length;

    while (i) {
      i -= 1;
      if (typeof _ignore[i] === 'object') {
        if (_ignore[i].test(file)) {
          utils.log(file, 'matched', _ignore[i], '- ignoring');
          return;
        }
      } else if (file.indexOf(_ignore[i]) !== -1) {
        utils.log(file, 'contained', _ignore[i], '- ignoring');
        return;
      }
    }

    if (!isHTML) {
      _copy(file, _in, _out, function () {
        built += 1;
        if (cb && files <= built) {
          cb();
        }
      });
      return;
    }

    path = file.replace(/\.html$/, '');

    if (!files.hasOwnProperty(path)) {
      files[path] = {};
    }

    files += 1;

    _build(file, _in, _out, _encoding, _engine, stat, function () {
      built += 1;
      if (cb && files <= built) {
        cb();
      }
    });
  });

  finder.on('end', function () {
    if (cb && files.length <= built) {
      cb();
    }
  });
};