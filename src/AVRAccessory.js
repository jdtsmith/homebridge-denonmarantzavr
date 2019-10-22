'use strict';
var net = require('net');
var throttledQueue=require('throttled-queue');
var debounce = require('debounce');


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

    this.throttle=throttledQueue(1,200); // space requests by 200ms
    this.updateVolumeDebounce=debounce(this.updateVolume.bind(this),500);

    this.lastGet={};
    this.resolve={};
    this.connect()     // Initiate the connection
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
      let match;
      data=data.toString().trim();
      this.log(`${this.name} - Status: `,data);      
      if ((match=data.match(/^(Z[M234])(ON|OFF)/)) && match.length>1) {
	// this.log(`${this.name} - Status: `,data);
	this.updateZone(match[1],match[2]);
      } else if ((match=data.match(/^(MV|Z[234])([0-9]+)/)) && match.length>1) {
	this.updateVolumeDebounce(match[1]=='MV'?'ZM':match[1],match[2]);
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

      let sw=this.config.speaker?
	  new Service.Speaker(name,zone):
	  new Service.Switch(name,zone);
      
      sw.getCharacteristic(Characteristic.On)
	.on('get', this.getStatus.bind(this,zone))
      	.on('set', this.setStatus.bind(this,zone));

      if(this.config.speaker)
	sw.addCharacteristic(Characteristic.Volume)
        .on('get', this.getVolume.bind(this,zone))
        .on('set', this.setVolume.bind(this,zone));

      this.switches[zone]={"service":sw};
    }
    return Object.values(this.switches).map(x=>x.service);
  }

  // Get information on status/volume from the AVR
  queryZone(zone) {
    this.write(zone + '?');
  }

  queryVolume(zone) {
    this.log("QUERYING VOLUME for: ",zone)
    if(zone=='ZM') {
      this.write('MV?')		// special for main zone
    } else this.queryZone(zone) // Come normally
  }
  
  getStatus(zone,callback) {
    if(!this.switches[zone]) {
      callback(new Error(`No such zone: ${zone}`));
    }
    var date=new Date();
    if(zone in this.lastGet) {
      // if more than 5m elapsed, recheck just in case. (shouldn't need to)
      if((date-this.lastGet[zone]) > 5*60*1e3) { 
	this.queryZone(zone)
	this.lastGet[zone]=date
      }
    } else {
      this.lastGet[zone]=date
    }
    this.log(`${zone} Status GET: ${this.switches[zone].status}`)
    callback(null,this.switches[zone].status);
  }

  getVolume(zone,callback) {
    if(!this.switches[zone]) {
      callback(new Error(`No such zone: ${zone}`));
    }
    var date=new Date();
    if(zone in this.lastGet) {
      // if more than 5m elapsed, recheck just in case. (shouldn't need to)
      if((date-this.lastGet[zone]) > 5*60*1e3) { 
	this.queryVolume(zone)
	this.lastGet[zone]=date
      }
    } else {
      this.lastGet[zone]=date
    }
    this.log(`${zone} Volume GET: ${this.switches[zone].volume}`)
    callback(null,this.switches[zone].volume);
  }
    
  async setStatus(zone,status,callback) {
    this.log(`Setting ${zone} status to ${status}`)
    if(!this.switches[zone]) {
      callback(new Error(`No such zone: ${zone}`));
      return;
    }
    try { // wait for data to arrive
      this.write(zone + (status?'ON':'OFF'));
      await new Promise((resolve,reject)=>{ // resolve'd when info received
	this.resolve.status={resolve:resolve,value:status}
	// This timeout rejection runs if it wasn't resolve'd first:
	setTimeout(() => reject(`Timed out waiting for status ${status}`),2000)
      })
      this.log(`Calling back with ${this.switches[zone].status}`);
      callback(null);
    } catch(error) {
      callback(new Error(error))
    }
    delete(this.resolve.status)
  }

  async setVolume(zone,vol,callback) {
    this.log(`Setting AVR ${zone} Volume to ${vol}`)
    if((vol-Math.floor(vol))>0) { // fractional volume, add digit
      vol=(vol*10).toString.substr(0,3)
      if(vol<100) vol='0'+vol;	// zero-pad
    } else if(vol<10) vol='0'+vol;
    try { // wait for volume to be set elsewhere
      this.write((zone=='ZM'?'MV':zone) + vol);
      await new Promise((resolve,reject)=> { 
	this.resolve.volume={resolve:resolve,value:vol}
	setTimeout(() => reject(`Timed out waiting for volume ${vol}`),2000)
      })
      this.log(`Calling back with ${this.switches[zone].volume}`);
      callback(null,this.switches[zone].volume);
    } catch(error) {
      callback(new Error(error))
    }
    delete(this.resolve.volume)
  }

  write(msg) {
    this.throttle(() => this.client.write(msg+'\r'));
  }
  
  updateVolume(zone,volume) {
    if(this.config.speaker) {
      this.switches[zone].volume=volume.length==3?
	Math.round(volume/10):parseInt(volume)
      this.log(`Updating ${zone} Volume to ${this.switches[zone].volume}`)
      this.switches[zone].service.getCharacteristic(Characteristic.Volume).
	updateValue(this.switches[zone].volume);
      if(this.resolve.volume && this.switches[zone].volume==this.resolve.volume.value)
	this.resolve.volume.resolve(this.switches[zone].volume)
    }
  }

  updateZone(zone,status) {
    if(this.switches[zone]) {
      this.switches[zone].status = status=='ON';
      this.log(`Updating ${zone} Status to ${this.switches[zone].status}`)
      this.switches[zone].service.getCharacteristic(Characteristic.On).
	updateValue(this.switches[zone].status);
      if(this.resolve.status && this.switches[zone].status==this.resolve.status.value)
	this.resolve.status.resolve(this.switches[zone].status)
    }
  }
}

module.exports = AVRAccessory;
