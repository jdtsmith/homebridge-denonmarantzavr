'use strict';
var net = require('net');
var throttledQueue=require('throttled-queue');

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
      this.log.warn(this.name+': no ip configured for connection, aborting.');
      return;
    }
    config.model=config.model || 'DENON-LIKE AVR';
    this.config = config;
    this._services = this.createServices();

    this.throttle=throttledQueue(1,150); // space requests by 150ms
    
    // Initiate the connection
    this.connect()
  }

  connect() {
    var client=new net.Socket();
    client.setKeepAlive(true);
    client.connect(PORT,this.config.ip)

    client.on('error',error => {
      this.log.warn(`${this.name} - Error connecting to ${this.config.ip}: `,error);
      this.log.warn(`${this.name} - Reattempting connection in 5s`);
      setTimeout(() => this.connect(),5000);
    });
    
    client.on('ready', () => {	// query state of all zones
      this.log(`${this.name} - Connected`);
      if(this.switches) 
	Object.keys(this.switches).forEach(zone => this.queryZone(zone));
    });

    client.on('data', data => {
      data=data.toString().trim();
      var match=data.match(/^(Z[M234])(ON|OFF)/);
      if (match && match.length>1) {
	this.log(`${this.name} - Status: `,data);
	this.updateZone(match[1],match[2]);
      } else if (data=='PWSTANDBY') {
	this.log(this.name+' - Standing-by all Zones');
	Object.keys(this.switches).map(x=>this.updateZone(x,'OFF'));
      }
    });
    this.client=client;
  }
  
  getServices() {
    return this._services;
  }

  createServices() {
    var services=this.getSwitchServices();
    services.push(this.getAccessoryInformationService());
    return services;
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
    for(var i=1;i<=this.config.zones;i++) {
      let name,	zone= 'Z' + (i==1?'M':i);
      if(this.config.zonenames && this.config.zonenames[i-1]) {
	name=this.config.zonenames[i-1];
      } else {
	name=this.name;
	if (i>1) name+=`(${zone})`;
      }
      let sw=new Service.Switch(name,zone);
      
      sw.getCharacteristic(Characteristic.On)
	.on('get', this.getStatus.bind(this,zone))
      	.on('set', this.setStatus.bind(this,zone));
    
      this.switches[zone]={"service":sw};
    }
    return Object.values(this.switches).map(x=>x.service);
  }

  getStatus(zone,callback) {
    if(!this.switches[zone]) {
      callback(new Error(`No such zone: ${zone}`));
    }
    var date=new Date();
    if(zone in this.getCalled) {
      if((date-this.getCalled[zone]) > 10*60*1e3) { // more than 10m elapsed, recheck
	queryZone(zone)
	this.getCalled[zone]=date
      }
    } else {
      this.getCalled[zone]=date
    }
    callback(null,this.switches[zone].status);
  }

  setStatus(zone,status,callback) {
    if(!this.switches[zone]) {
      callback(new Error(`No such zone: ${zone}`));
      return;
    } 
    this.write(zone + (status?'ON':'OFF'));
    callback(null);
  }

  queryZone(zone) {
    this.write(zone + '?');
  }

  write(msg) {
    this.throttle(() => this.client.write(msg+'\r'));
  }
  
  updateZone(zone,status) {
    if(this.switches[zone]) {
      this.switches[zone].status = status=='ON';
      this.switches[zone].service.getCharacteristic(Characteristic.On).
	updateValue(this.switches[zone].status);
    }
  }
}

module.exports = AVRAccessory;
