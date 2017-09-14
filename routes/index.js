var express = require('express');
var router = express.Router();
const Influx = require('influx');
const ansi_up = new (require('ansi_up').default);
ansi_up.use_classes = true;
const strftime = require('strftime');
const escapeHtml = require('escape-html');

const influx = new Influx.InfluxDB({
  host: process.env.INFLUX_HOST || 'localhost',
  database: process.env.INFLUX_DATABASE || 'telegraf'
});

var showError = function (error, res) {
  res.status(500);
  res.json({
    status: "error",
    error: error.message,
    response: {
      code: error.res.statusCode,
      headers: error.res.headers
    }
  });
}

var getFeeds = function (res, callback) {
  influx.getMeasurements().then((results) => {
    res.locals.feeds = results;
    callback();
  }).catch((error) => {
    callback(error);
  });
};

var getStructure = function (feed, callback) {
  var fields = [
    {fieldKey: 'time', fieldType: 'time'}
  ];

  influx.query(`SHOW FIELD KEYS from "${feed}"`)
    .then((result) => {
      result.forEach(field => fields.push(field) );
      return influx.query(`SHOW TAG KEYS FROM "${feed}"`);
    })
    .then((result) => {
      result.forEach((row) => {
        fields.push({fieldKey: row.tagKey, fieldType: 'tag'});
      });
      callback(fields);
    }).catch((error) => {
      callback(null, error);
    });
};

var escapeRegExp = function (str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

/* GET home page. */
router.get('/', function(req, res, next) {
  getFeeds(res, (error) => {
    if (error) {
      showError(error, res);
    } else {
      res.render('index');
    }
  });
});

router.get('/:feed', function (req, res, next) {
  getFeeds(res, (error) => {
    if (error) {
      showError(error, res);
      return;
    }

    var search = req.query.q || {};
    Object.assign(res.locals, {
      name: req.params.feed,
      ansi_up: ansi_up,
      strftime: strftime,
      search: search
    });

    getStructure(req.params.feed, (feilds) => {
      res.locals.fields = feilds;
      var fieldsHash = {};
      feilds.forEach(field => fieldsHash[field.fieldKey] = field);

      var cond = [];
      if (req.query.before) {
        cond.push(`time < ${req.query.before}`);
      }
      Object.keys(search).forEach((key) => {
        if (search[key] && search[key] !== '') {
          if (fieldsHash[key].fieldType == 'integer' || fieldsHash[key].fieldType == 'float') {
            var value = search[key].replace(/[^\d\.]/g, '');
            cond.push(`"${key}" = ${value}`);
          } else {
            //cond.push(`"${key}" =~ /${escapeRegExp(search[key])}/`);
            cond.push(`"${key}" =~ /${search[key]}/`);
          }
        } else {
          delete search[key];
        }
      });

      var condStr = cond.length ? `where ${cond.join(" and ")}` : '';
      var query = `select * from ${req.params.feed} ${condStr} order by time desc limit 100`;
      console.log("INFLUX", query);
      influx.query(query).then((results) => {
        res.render('feed', {logRows: results,});
      }).catch((error) => {
        showError(error, res);
      });
    });
  });

});

module.exports = router;


// s 1505195221517137000
// q 1505155715029000000
// f 1505155715029849000
