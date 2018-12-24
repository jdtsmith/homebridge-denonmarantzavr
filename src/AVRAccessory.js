'use strict';
var net = require('net');
const PORT = 23;

let Characteristic, Service;

class AVRAccessory {
  constructor(api, log, config) {
    Characteristic = api.hap.Characteristic;
    Service = api.hap.Service;
    this.log = log;
    this.name = config.name;

    config.zones=config.zones || 1;
    if(!config.ip) {
      this.log.warn(this.name: ': no ip configured for connection, aborting.');
      return;
    }
    config.model=config.model || 'DENON-LIKE AVR';
    this.config = config;
    
    // Initiate the connection
    var client = new net.Socket();
    client.setKeepAlive(true);
    client.connect(PORT,config.ip)

    client.on('connect', () => {
      this._services = this.createServices();
      if(this.switches) 
	Object.keys(this.switches).forEach(zone => queryZone(zone));
    });
    
    client.on('error',error => {
      this.log.warn(`Error connecting to ${config.ip}: `,error);
    });
    
    client.on('data', data => {
      var match=data.match(/^(Z[M234])(ON|OFF)/);
      if (match && match.length>1) {
	this.log('Got matching status: ',data.trim());
	this.updateZone(match[1],match[2]);
      }
    });
    
    this.client=client;
  }

  getServices() {
    return this._services;
  }

  createServices() {
    return [
      this.getSwitchServices(),
      this.getAccessoryInformationService()
    ].flat();
  }

  getAccessoryInformationService() {
    return new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, 'JD Smith')
      .setCharacteristic(Characteristic.Model, this.config.model)
      .setCharacteristic(Characteristic.SerialNumber, '01')
      .setCharacteristic(Characteristic.FirmwareRevision, this.version)
      .setCharacteristic(Characteristic.HardwareRevision, this.version);
  }

  getSwitchServices() {
    this.switches={};
    for(i=1;i<=this.config.zones;i++) {
      let zone= 'Z' + (i==1?'M':i);
      let name=this.name;
      if (i>1) name+=`(${zone})`;
      let sw=new Service.Switch(name);
      
      sw.getCharacteristic(Characteristic.On)
	.on('get', this.getStatus.bind(this,zone));
      	.on('set', this.setStatus.bind(this,zone));
    
      this.switches[zone]=sw;
    }
    return this.switches;
  }

  getStatus(zone,callback) {
    if(!this.switch[zone]) {
      callback(new Error(`No such zone: ${zone}`));
    } 
    callback(null,this.status[zone]);
  }

  setStatus(zone,status,callback) {
    if(!this.switch[zone]) {
      callback(new Error(`No such zone: ${zone}`));
      return;
    } 
    this.client.write(zone + (status?'ON':'OFF') + '\r');
    callback(null);
  }

  queryZone(zone) {
    this.client.write(zone + '?\r');
  }

  updateZone(zone,status,callback) {
    if(this.switch[zone]) {
      this.status[zone] = status=='ON';
      this.switch[zone].getCharacteristic(Characteristic.On).
	updateValue(this.status[zone]);
    }
  }
}
