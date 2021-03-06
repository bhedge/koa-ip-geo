'use strict';

let debug = require('debug')('koa-ip-geo');
let mmdbReader = require('mmdb-reader');
let fs = require('fs');
let tools = require('./tools')

module.exports = ipGeoFilter;

function ipGeoFilter(conf) {
  let reader;

  // ---------------------------------
  // CONFIGURATION
  // ---------------------------------

  // parameter handling - allows wider range of possible parameter types
  if (typeof conf !== 'object') {
    if (typeof conf === 'string') {
      conf = {whiteListIP: conf.split(' ')};
    } else {
      conf = {};
    }
  }

  conf.development = conf.development || false;
  conf.context = conf.context || false;

  if (Array.isArray(conf)) {
    conf = {whiteListIP: conf};
  }
  if (conf.whiteListIP && typeof conf.whiteListIP === 'string') {
    conf.whiteListIP = conf.whiteListIP.split(' ');
  }
  if (conf.whiteListIP && Array.isArray(conf.whiteListIP)) {
      conf.whiteListIP = tools.corrLocalhost(conf.whiteListIP)
  }
  if (conf.blackListIP && typeof conf.blackListIP === 'string') {
    conf.blackListIP = conf.blackListIP.split(' ');
  }
  if (conf.blackListIP && Array.isArray(conf.blackListIP)) {
      conf.blackListIP = tools.corrLocalhost(conf.blackListIP)
  }
  if (conf.whiteListCountry && typeof conf.whiteListCountry === 'string') {
    conf.whiteListCountry = conf.whiteListCountry.split(' ');
  }
  if (conf.blackListCountry && typeof conf.blackListCountry === 'string') {
    conf.blackListCountry = conf.blackListCountry.split(' ');
  }
  if (conf.whiteListContinent && typeof conf.whiteListContinent === 'string') {
    conf.whiteListContinent = conf.whiteListContinent.split(' ');
  }
  if (conf.blackListContinent && typeof conf.blackListContinent === 'string') {
    conf.blackListContinent = conf.blackListContinent.split(' ');
  }

  // loading geoDB (only if needed)
  if (conf.geoDB && typeof conf.geoDB === 'string' && (conf.context || conf.whiteListCountry || conf.blackListCountry || conf.whiteListContinent || conf.blackListContinent)) {
    try {
      fs.accessSync(conf.geoDB, fs.R_OK);
      reader = new mmdbReader(conf.geoDB);
    } catch(ex) {
      debug('ERROR - GeoDB file ' + conf.geoDB + ' not found');
    }
  }

  var forbidden = conf.forbidden || '403 Forbidden'

  // ---------------------------------
  // MIDDLEWARE function starts here
  // ---------------------------------

  return function* (next) {

    if (conf.development) {
      yield next;
    } else {
      let _ip = this.ip;
      _ip = tools.corrIP(_ip);


      let _city = '-';
      let _country = '-';
      let _continent = '-';
      let _countryCode = '-';
      let _continentCode = '-';
      let _latitude = '-';
      let _longitude = '-';

      let pass = false;
      let handled = false;
      let data = null;

      if (conf.whiteListIP && Array.isArray(conf.whiteListIP)) {
        pass = conf.whiteListIP.some(function (item) {
          return RegExp(item).test(_ip);
        });
        handled = pass;
      } else {
        if (conf.blackListIP && Array.isArray(conf.blackListIP)) {
          pass = !conf.blackListIP.some(function (item) {
            return RegExp(item).test(_ip);
          });
          handled = !pass;
        }
      }

      // get geoData only if needed
      if (conf.context || ((!handled) && reader && (conf.whiteListCountry || conf.blackListCountry || conf.whiteListContinent || conf.blackListContinent))) {
        let data = reader.lookup(_ip);
        if (data) {
          _city = (data.city && data.city.names && data.city.names.en) ? data.city.names.en : '-'
          _country = (data.country && data.country.names && data.country.names.en) ? data.country.names.en : '-';
          _continent = (data.continent && data.continent.names && data.continent.names.en) ? data.continent.names.en : '-';
          _countryCode = (data.country && data.country.iso_code) ? data.country.iso_code : '-';
          _continentCode = (data.continent && data.continent.code) ? data.continent.code : '-';
          _latitude = (data.location && data.location.latitude) ? data.location.latitude : '-';
          _longitude = (data.location && data.location.longitude) ? data.location.longitude : '-';
        }

        // store it in context, if option is set
        if (conf.context) {
          this.geoCity = _city;
          this.geoCountry = _country;
          this.geoContinent = _continent;
          this.geoCountryCode = _countryCode;
          this.geoContinentCode = _continentCode;
          this.geoLatitude = _latitude;
          this.geoLongitude = _longitude;
        }
      }

      // IP white / blacklisted --> filter by geocoding if needed
      if (reader && (!handled) && data && (conf.whiteListCountry || conf.blackListCountry || conf.whiteListContinent || conf.blackListContinent)) {

        // try to handle by whiteList / blackList county
        if (conf.whiteListCountry && Array.isArray(conf.whiteListCountry)) {
          pass = conf.whiteListCountry.some(function (item) {
            return RegExp(item).test(_countryCode);
          });
          handled = pass;
        } else {
          if (conf.blackListCountry && Array.isArray(conf.blackListCountry)) {
            pass = !conf.blackListCountry.some(function (item) {
              return RegExp(item).test(_countryCode);
            });
            handled = !pass;
          }
        }

        // still not handled (by whiteList / blackList county) -- handle by whiteList / blackList continent
        if (!handled) {
          if (conf.whiteListContinent && Array.isArray(conf.whiteListContinent)) {
            pass = conf.whiteListContinent.some(function (item) {
              return RegExp(item).test(_continentCode);
            });
            handled = pass;
          } else {
            if (conf.blackListContinent && Array.isArray(conf.blackListContinent)) {
              pass = !conf.blackListContinent.some(function (item) {
                return RegExp(item).test(_continentCode);
              });
              handled = !pass;
            }
          }
        }
      }

      if (pass) {
        debug((new Date).toUTCString() + ' ' + _ip + ' ' + _continentCode + ' ' + _countryCode + ' -> ✓');
        yield next;
      } else {
        debug((new Date).toUTCString() + ' ' + _ip + ' ' + _continentCode + ' ' + _countryCode + ' -> ×');
        this.status = 403
        this.body = typeof forbidden === 'function' ? forbidden.call(this, this) : forbidden
        return

      }
    }
  }
}
