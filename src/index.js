const version = require('package.json').version;
const AVRAccessory = require('src/AVRAccessory');

const platformName = 'homebridge-denonmarantzavr';
const platformPrettyName = 'DenonMarantzAVR';

module.exports = (homebridge) => {
  homebridge.registerPlatform(platformName, platformPrettyName, AVRPlatform, true);
};

const AVRPlatform = class {
  constructor(log, config, api) {
    this.log = log;
    this.log(`${platformPrettyName} Plugin Loaded - Version ${version}`);
    this.config = config;
    this.api = api;
  }

  accessories(callback) {
    const accessories = [];
    
    this.config.avrs.forEach(avr => {
      avr.version = version;
      accessories.push(new AVRAccessory(this.api, this.log, screen));
    });
    callback(accessories);
  }
};
