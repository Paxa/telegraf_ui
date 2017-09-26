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
    stack: error.stack,
    response: {
      code: error.res && error.res.statusCode,
      headers: error.res && error.res.headers
    }
  });
};

var query = function (sql) {
  var startTime = Date.now();

  return new Promise((resolve, reject) => {
    influx.query(sql).then((results) => {
      console.log(`Influx SQL: ${sql} -- ${Date.now() - startTime}ms`);
      resolve(results);
    }).catch((error) => {
      console.log(`Influx ERROR: ${sql} -- ${error.message} -- ${Date.now() - startTime}ms`);
      reject(error);
    });
  });
};

var getFeeds = function (res) {
  return new Promise((resolve, reject) => {

    query("show measurements").then((results) => {
      res.locals.feeds = results.map((row) => { return row.name });
      resolve(res.locals.feeds);
    }).catch((error) => {
      reject(error);
    });

  });
};

var getStructure = function (feed) {
  var fields = [
    {fieldKey: 'time', fieldType: 'time'}
  ];

  return new Promise((resolve, reject) => {
    query(`SHOW FIELD KEYS from "${feed}"`)
    .then((result) => {
      result.forEach(field => fields.push(field) );
      return query(`SHOW TAG KEYS FROM "${feed}"`);
    })
    .then((result) => {
      result.forEach((row) => {
        fields.push({fieldKey: row.tagKey, fieldType: 'tag'});
      });
      resolve(fields);
    }).catch((error) => {
      reject(error);
    });
  });
};

var escapeRegExp = function (str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

/* GET home page. */
router.get('/', function(req, res, next) {
  getFeeds(res).then(() => {
    res.render('index');
  }).catch((error) => {
    showError(error, res);
  });
});

router.get('/:feed', function (req, res, next) {
  var search = req.query.q || {};
  Object.assign(res.locals, {
    name: req.params.feed,
    ansi_up: ansi_up,
    strftime: strftime,
    search: search
  });

  getFeeds(res).then(() => {
    return getStructure(req.params.feed);
  }).then((feilds) => {
    res.locals.fields = feilds;
    var fieldsHash = {};
    feilds.forEach(field => fieldsHash[field.fieldKey] = field);

    var cond = [];
    if (req.query.before) {
      cond.push(`time < ${req.query.before}`);
    }

    Object.keys(search).forEach((key) => {
      if (search[key] && search[key] !== '') {
        if (key == "time_range") {
          if (search[key].match(/^\d+(s|m|h|d|w)$/)) {
            cond.push(`"time" > now() - ${search[key]}`);
          } else {
            console.log(`Warning: Unknown time range format: ${search[key]}`);
          }
        } else if (key == "time_afer") {
          var date = new Date(search[key] + " +0700");
          cond.push(`"time" > ${date.getTime() * 1000000}`);
        } else if (key == "time_before") {
          var date = new Date(search[key] + " +0700");
          cond.push(`"time" < ${date.getTime() * 1000000}`);
        } else if (fieldsHash[key] && (fieldsHash[key].fieldType == 'integer' || fieldsHash[key].fieldType == 'float')) {
          var value = search[key].replace(/[^\d\.]/g, '');
          cond.push(`"${key}" = ${value}`);
        } else {
          //cond.push(`"${key}" =~ /${escapeRegExp(search[key])}/`);
          cond.push(`"${key}" =~ /${search[key].replace("/", "\\/")}/`);
        }
      } else {
        delete search[key];
      }
    });

    var condStr = cond.length ? `where ${cond.join(" and ")}` : '';
    var listQuery = `select * from ${req.params.feed} ${condStr} order by time desc limit 50`;

    query(listQuery).then((results) => {
      res.render('feed', {
        logRows: results.reverse()
      });
    }).catch((error) => {
      showError(error, res);
    });

  }).catch((error) => {
    showError(error, res);
  });
});

router.get('/:feed/stats', function (req, res, next) {
  var stats = {total: 0, interval: 20, rate: {}};

  Object.assign(res.locals, {
    name: req.params.feed,
    ansi_up: ansi_up,
    strftime: strftime
  });

  getFeeds(res).then(() => {
    return query(`select count(*) from "${req.params.feed}"`);
  }).then((results) => {
    Object.keys(results[0]).forEach((key) => {
      if (typeof results[0][key] == 'number' && results[0][key] > stats.total) {
        stats.total = results[0][key];
      }
    });
    return query(`select * from "${req.params.feed}" order by time asc limit 1`);
  }).then((results) => {
    stats.firstAt = results[0] && results[0].time;
    return query(`select * from "${req.params.feed}" order by time desc limit 1`);
  }).then((results) => {
    stats.lastAt = results[0] && results[0].time;
    return query(`select count(*) from "${req.params.feed}" where time > now() - 1d group by time(${stats.interval}m)`);
  }).then((results) => {
    results.forEach((row) => {
      var value = 0;
      Object.keys(row).forEach((key) => {
        if (key != 'time' && row[key] > value) {
          value = row[key];
        }
      });
      stats.rate[row.time.getTime()] = value;
    });

    res.render('stats', {stats: stats});
  }).catch((error) => {
    showError(error, res);
  });
});

module.exports = router;
